import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import MakeOfferModal from '../components/MakeOfferModal'
import RetryState from '../components/RetryState'
import { api, ApiError } from '../lib/api'
import './VendorRequestsPage.css'

type ListingResponse = {
  listingId: string
  ownerId: string
  title: string
  description: string | null
  categoryId: string
  categoryName: string
  condition: string
  quantity: number
  unit: string
  expectedAmount: number | null
  currency: string | null
  locationId: string | null
  status: string
  createdAt: string
  updatedAt: string
  ownerCorporateId: string | null
}

type CorporateProfileResponse = {
  corporateId: string
  userId: string
  companyName: string
  description: string | null
  businessRegistrationNumber: string | null
  industry: string | null
  website: string | null
  locationText: string | null
  verificationStatus: string
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

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

type OfferStatus = 'idle' | 'sending' | 'sent' | 'error'
type MessageStatus = 'idle' | 'loading' | 'error'
type ConversationDto = { _id: string }

type BusinessInfo = { companyName: string; userId: string }

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function fetchBusinessInfo(corporateIds: string[]): Promise<Record<string, BusinessInfo>> {
  const unique = Array.from(new Set(corporateIds))
  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const profile = await api.get<CorporateProfileResponse>(`/api/corporate-profiles/${id}`)
        return [id, { companyName: profile.companyName, userId: profile.userId }] as const
      } catch {
        return [id, { companyName: 'Unknown', userId: '' }] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}

function VendorRequestsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [businessInfo, setBusinessInfo] = useState<Record<string, BusinessInfo>>({})
  const [vendorProfileMissing, setVendorProfileMissing] = useState(false)
  const [offerStatus, setOfferStatus] = useState<Record<string, OfferStatus>>({})
  const [messageStatus, setMessageStatus] = useState<Record<string, MessageStatus>>({})
  const [offerModalListing, setOfferModalListing] = useState<ListingResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [listingsRes, hasVendorProfile] = await Promise.all([
        api.get<ListingResponse[]>('/api/listings', { status: 'ACTIVE' }),
        api.get<VendorProfileResponse>('/api/vendor-profiles/mine').then(
          () => true,
          (err) => {
            if (err instanceof ApiError && err.status === 404) return false
            throw err
          },
        ),
      ])

      setListings(listingsRes)
      setVendorProfileMissing(!hasVendorProfile)

      const corporateIds = listingsRes
        .map((listing) => listing.ownerCorporateId)
        .filter((id): id is string => Boolean(id))
      const info = await fetchBusinessInfo(corporateIds)
      setBusinessInfo(info)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submitOffer(listing: ListingResponse, amount: number, currency: string, message: string) {
    if (!listing.ownerCorporateId) return
    setOfferStatus((prev) => ({ ...prev, [listing.listingId]: 'sending' }))
    try {
      // buyerId is derived server-side from the signed-in vendor. The vendor sets the amount;
      // the listing's expectedAmount is only a starting suggestion in the modal.
      await api.post('/api/offers', {
        listingId: listing.listingId,
        sellerId: listing.ownerCorporateId,
        offeredAmount: amount,
        currency,
        message: message || undefined,
      })
      setOfferStatus((prev) => ({ ...prev, [listing.listingId]: 'sent' }))
      setOfferModalListing(null)
    } catch (err) {
      setOfferStatus((prev) => ({ ...prev, [listing.listingId]: 'error' }))
      throw err
    }
  }

  async function handleMessage(listing: ListingResponse) {
    const ownerUserId = listing.ownerCorporateId ? businessInfo[listing.ownerCorporateId]?.userId : undefined
    if (!ownerUserId) return
    setMessageStatus((prev) => ({ ...prev, [listing.listingId]: 'loading' }))
    try {
      // I'm the vendor initiating contact here — pass roles explicitly since the endpoint's
      // defaults assume the caller is the vendor and would mislabel the other participant.
      const conversation = await api.post<ConversationDto>('/api/conversations', {
        participantUserId: ownerUserId,
        participantRole: 'vendor',
        otherParticipantRole: 'corporate',
        listingId: listing.listingId,
      })
      navigate('/messages', { state: { conversationId: conversation._id } })
    } catch {
      setMessageStatus((prev) => ({ ...prev, [listing.listingId]: 'error' }))
    }
  }

  return (
    <div className="page">
      <Navbar variant="vendor" />

      <main className="app-main">
        <div className="page-header">
          <h1>Find Requests</h1>
          <p>Recycling pickup and delivery requests posted by nearby businesses.</p>
        </div>

        {loading ? (
          <p className="table-state">Loading requests…</p>
        ) : error ? (
          <RetryState message={error} onRetry={load} />
        ) : listings.length === 0 ? (
          <p className="table-state">No active requests right now.</p>
        ) : (
          <>
            {vendorProfileMissing && (
              <p className="table-state">
                Complete your vendor profile to respond to requests.
              </p>
            )}

            <div className="request-grid">
              {listings.map((listing) => {
                const status = offerStatus[listing.listingId] ?? 'idle'
                const disabledReason = vendorProfileMissing
                  ? 'Complete your vendor profile to respond to requests'
                  : !listing.ownerCorporateId
                    ? "This business hasn't completed their profile yet"
                    : undefined
                const business = listing.ownerCorporateId
                  ? businessInfo[listing.ownerCorporateId]?.companyName ?? 'Unknown'
                  : 'Unknown'
                const ownerUserId = listing.ownerCorporateId
                  ? businessInfo[listing.ownerCorporateId]?.userId
                  : undefined
                const msgStatus = messageStatus[listing.listingId] ?? 'idle'

                return (
                  <article className="request-card" key={listing.listingId}>
                    <div className="request-card-top">
                      <h2>{business}</h2>
                      <span className="request-fulfillment">{humanize(listing.condition)}</span>
                    </div>

                    <p className="request-location">—</p>

                    <div className="request-tags">
                      <span className="request-tag">{listing.categoryName}</span>
                    </div>

                    <p className="request-quantity">
                      Est. quantity: {listing.quantity} {listing.unit}
                    </p>
                    <p className="request-posted">Posted {formatRelativeTime(listing.createdAt)}</p>

                    <div className="request-card-actions">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={status === 'sending' || status === 'sent' || Boolean(disabledReason)}
                        title={disabledReason}
                        onClick={() => setOfferModalListing(listing)}
                      >
                        {status === 'sent'
                          ? 'Offer Sent'
                          : status === 'sending'
                            ? 'Sending…'
                            : status === 'error'
                              ? 'Failed — Retry'
                              : 'Make Offer'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={msgStatus === 'loading' || !ownerUserId}
                        title={!ownerUserId ? "This business hasn't completed their profile yet" : undefined}
                        onClick={() => handleMessage(listing)}
                      >
                        {msgStatus === 'loading'
                          ? 'Opening…'
                          : msgStatus === 'error'
                            ? 'Failed — Retry'
                            : 'Message'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </main>

      {offerModalListing && (
        <MakeOfferModal
          listingTitle={`${offerModalListing.categoryName || offerModalListing.title} · ${offerModalListing.quantity} ${offerModalListing.unit}`}
          suggestedAmount={offerModalListing.expectedAmount}
          currency={offerModalListing.currency ?? 'EGP'}
          onClose={() => setOfferModalListing(null)}
          onSubmit={(amount, currency, message) => submitOffer(offerModalListing, amount, currency, message)}
        />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default VendorRequestsPage
