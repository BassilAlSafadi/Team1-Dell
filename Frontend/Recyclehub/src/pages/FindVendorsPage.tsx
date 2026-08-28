import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import RetryState from '../components/RetryState'
import RateVendorModal from '../components/RateVendorModal'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import './FindVendorsPage.css'

const MATERIALS = ['Plastic', 'Glass', 'Metal', 'Cardboard', 'Paper', 'Other']

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

type ContactState = 'idle' | 'loading' | 'error'

type ConversationDto = { _id: string }

function vendorMaterials(vendor: VendorProfileResponse): string[] {
  if (!vendor.categoryPreference) return []
  return vendor.categoryPreference
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

function FindVendorsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [vendors, setVendors] = useState<VendorProfileResponse[]>([])
  const [ratings, setRatings] = useState<Record<string, RatingInfo>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contactState, setContactState] = useState<Record<string, ContactState>>({})
  const [contactError, setContactError] = useState<Record<string, string>>({})
  const [rateVendor, setRateVendor] = useState<VendorProfileResponse | null>(null)

  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')

  async function loadRatings(list: VendorProfileResponse[]) {
    const entries = await Promise.all(
      list.map(async (vendor) => {
        try {
          const profile = await api.get<AuthVendorProfile>(`/api/vendors/${vendor.userId}/profile`)
          return [
            vendor.userId,
            { averageRating: profile.averageRating, reviewCount: profile.reviewCount },
          ] as const
        } catch {
          return [vendor.userId, null] as const
        }
      }),
    )
    setRatings((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
  }

  async function search(q: string, cityFilter: string, categoryFilter: string) {
    setIsLoading(true)
    setError(null)
    try {
      // GET /api/vendor-profiles?q=&city=&category= — VendorProfileService.SearchAsync
      // filters by vendor name (q), location (city, ILIKE) and CategoryPreference.
      const data = await api.get<VendorProfileResponse[]>('/api/vendor-profiles', {
        q: q || undefined,
        city: cityFilter || undefined,
        category: categoryFilter || undefined,
      })
      setVendors(data)
      await loadRatings(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load vendors.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    search('', '', '')
  }, [])

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    search(query.trim(), city.trim(), category)
  }

  const handleContact = async (vendor: VendorProfileResponse) => {
    setContactState((prev) => ({ ...prev, [vendor.userId]: 'loading' }))
    setContactError((prev) => {
      const next = { ...prev }
      delete next[vendor.userId]
      return next
    })
    try {
      // I'm the business owner initiating contact here, so tag roles explicitly rather than
      // relying on the endpoint's defaults (which assume the caller is the vendor).
      const conversation = await api.post<ConversationDto>('/api/conversations', {
        participantUserId: vendor.userId,
        participantRole: 'corporate',
        otherParticipantRole: 'vendor',
      })
      navigate('/messages', { state: { conversationId: conversation._id } })
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

        <form className="business-search" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by vendor name…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search by vendor name"
          />
          <input
            type="text"
            placeholder="City or location…"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="Filter by city"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter by material"
          >
            <option value="">All materials</option>
            {MATERIALS.map((material) => (
              <option key={material} value={material}>
                {material}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>

        {isLoading ? (
          <div className="vendor-grid" aria-hidden="true">
            {[0, 1, 2].map((card) => (
              <article className="vendor-card vendor-card-skeleton" key={card}>
                <div className="vendor-card-top">
                  <span className="skeleton skeleton-text" style={{ width: '60%', height: 18 }} />
                  <span className="skeleton skeleton-text" style={{ width: 36 }} />
                </div>
                <span className="skeleton skeleton-text" style={{ width: '80%', marginTop: 12 }} />
                <span
                  className="skeleton"
                  style={{ width: 96, height: 32, borderRadius: 999, marginTop: 20 }}
                />
              </article>
            ))}
          </div>
        ) : error ? (
          <RetryState message={error} onRetry={() => search(query.trim(), city.trim(), category)} />
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

                  <div className="vendor-card-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={state === 'loading'}
                      onClick={() => handleContact(vendor)}
                    >
                      {state === 'loading' ? 'Opening…' : 'Message Vendor'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setRateVendor(vendor)}
                    >
                      Reviews &amp; rating
                    </button>
                  </div>
                  {state === 'error' && (
                    <p className="vendor-contact-error">{contactError[vendor.userId]}</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </main>

      {rateVendor && user && (
        <RateVendorModal
          vendorName={rateVendor.vendorName}
          vendorUserId={rateVendor.userId}
          reviewerUserId={user.userId}
          onClose={() => setRateVendor(null)}
          onRated={() => loadRatings([rateVendor])}
        />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default FindVendorsPage
