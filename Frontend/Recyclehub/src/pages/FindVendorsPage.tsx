import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import { api, ApiError } from '../lib/api'
import './FindVendorsPage.css'

type VendorProfileResponse = {
  vendorId: string
  userId: string
  vendorName: string
  description: string | null
  businessRegistrationNumber: string | null
  categoryPreference: string | null
  fulfillmentMethod: string | null
  operatingHours: string | null
  locationText: string | null
  minimumAmount: number | null
  verificationStatus: string
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

type AuthVendorProfile = {
  vendorId: string
  email: string
  status: string
  averageRating: number
  reviewCount: number
}

type RatingInfo = { averageRating: number; reviewCount: number } | null

type ContactState = 'idle' | 'loading' | 'done' | 'error'

function vendorMaterials(vendor: VendorProfileResponse): string[] {
  if (!vendor.categoryPreference) return []
  return vendor.categoryPreference
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

function FindVendorsPage() {
  const [vendors, setVendors] = useState<VendorProfileResponse[]>([])
  const [ratings, setRatings] = useState<Record<string, RatingInfo>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contactState, setContactState] = useState<Record<string, ContactState>>({})
  const [contactError, setContactError] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await api.get<VendorProfileResponse[]>('/api/vendor-profiles')
        if (cancelled) return
        setVendors(data)

        const ratingEntries = await Promise.all(
          data.map(async (vendor) => {
            try {
              const profile = await api.get<AuthVendorProfile>(`/api/vendors/${vendor.userId}/profile`)
              return [vendor.userId, { averageRating: profile.averageRating, reviewCount: profile.reviewCount }] as const
            } catch {
              return [vendor.userId, null] as const
            }
          }),
        )
        if (cancelled) return
        setRatings(Object.fromEntries(ratingEntries))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load vendors.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleContact = async (vendor: VendorProfileResponse) => {
    setContactState((prev) => ({ ...prev, [vendor.userId]: 'loading' }))
    setContactError((prev) => {
      const next = { ...prev }
      delete next[vendor.userId]
      return next
    })
    try {
      await api.post('/api/conversations', { participantUserId: vendor.userId })
      setContactState((prev) => ({ ...prev, [vendor.userId]: 'done' }))
    } catch (err) {
      setContactState((prev) => ({ ...prev, [vendor.userId]: 'error' }))
      setContactError((prev) => ({
        ...prev,
        [vendor.userId]: err instanceof ApiError ? err.message : 'Failed to start conversation.',
      }))
    }
  }

  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Find Vendors</h1>
          <p>Registered local vendors ready to buy your recyclables.</p>
        </div>

        {isLoading ? (
          <p className="vendor-status">Loading vendors…</p>
        ) : error ? (
          <p className="vendor-status vendor-status-error">{error}</p>
        ) : vendors.length === 0 ? (
          <p className="vendor-status">No vendors found.</p>
        ) : (
          <div className="vendor-grid">
            {vendors.map((vendor) => {
              const rating = ratings[vendor.userId]
              const state = contactState[vendor.userId] ?? 'idle'
              return (
                <article className="vendor-card" key={vendor.vendorId}>
                  <div className="vendor-card-top">
                    <h2>{vendor.vendorName}</h2>
                    <span className="vendor-rating">
                      ★ {rating ? rating.averageRating.toFixed(1) : '—'}
                      {rating ? ` (${rating.reviewCount})` : ''}
                    </span>
                  </div>

                  <p className="vendor-location">{vendor.locationText || 'Location not specified'}</p>

                  <div className="vendor-tags">
                    {vendorMaterials(vendor).map((material) => (
                      <span className="vendor-tag" key={material}>
                        {material}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={state === 'loading' || state === 'done'}
                    onClick={() => handleContact(vendor)}
                  >
                    {state === 'loading'
                      ? 'Contacting…'
                      : state === 'done'
                        ? 'Contacted'
                        : 'Contact Vendor'}
                  </button>
                  {state === 'error' && (
                    <p className="vendor-contact-error">{contactError[vendor.userId]}</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default FindVendorsPage
