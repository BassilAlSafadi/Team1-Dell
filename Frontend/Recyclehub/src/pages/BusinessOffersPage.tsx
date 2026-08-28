import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import RetryState from '../components/RetryState'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import './BusinessOffersPage.css'

type OfferResponse = {
  offerId: string
  listingId: string
  buyerId: string
  sellerId: string
  offeredAmount: number
  currency: string
  message: string | null
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
  createdAt: string
  expiresAt: string | null
  respondedAt: string | null
}

type ListingResponse = {
  listingId: string
  title: string
  categoryName: string
  quantity: number
  unit: string
}

type VendorProfileResponse = {
  vendorId: string
  vendorName: string
  locationText: string | null
}

type CorporateProfileResponse = { corporateId: string }

type Row = {
  offer: OfferResponse
  listingLabel: string
  vendorName: string
  vendorLocation: string | null
}

type ActionState = 'idle' | 'accepting' | 'rejecting' | 'error'

function humanize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

// The offer only carries ids; resolve each distinct listing and vendor once for display.
async function resolveRows(offers: OfferResponse[]): Promise<Row[]> {
  const listingIds = Array.from(new Set(offers.map((o) => o.listingId)))
  const vendorIds = Array.from(new Set(offers.map((o) => o.buyerId)))

  const [listings, vendors] = await Promise.all([
    Promise.all(
      listingIds.map((id) =>
        api
          .get<ListingResponse>(`/api/listings/${id}`)
          .then((l) => [id, l] as const)
          .catch(() => [id, null] as const),
      ),
    ),
    Promise.all(
      vendorIds.map((id) =>
        api
          .get<VendorProfileResponse>(`/api/vendor-profiles/${id}`)
          .then((v) => [id, v] as const)
          .catch(() => [id, null] as const),
      ),
    ),
  ])

  const listingById = new Map(listings)
  const vendorById = new Map(vendors)

  return offers.map((offer) => {
    const listing = listingById.get(offer.listingId)
    const vendor = vendorById.get(offer.buyerId)
    return {
      offer,
      listingLabel: listing
        ? `${listing.title} · ${listing.quantity} ${listing.unit}`
        : 'Listing unavailable',
      vendorName: vendor?.vendorName ?? 'Unknown vendor',
      vendorLocation: vendor?.locationText ?? null,
    }
  })
}

function BusinessOffersPage() {
  // Set when arriving from a "new offer" notification click — highlights and scrolls
  // to that offer once the list is loaded.
  const location = useLocation()
  const highlightOfferId = (location.state as { highlightOfferId?: string } | null)?.highlightOfferId

  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [actions, setActions] = useState<Record<string, ActionState>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await api.get<CorporateProfileResponse>('/api/corporate-profiles/mine')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setHasProfile(false)
        setLoading(false)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load offers.')
      setLoading(false)
      return
    }
    setHasProfile(true)

    try {
      // role=SELLER: offers vendors have made on this business's own listings.
      const offers = await api.get<OfferResponse[]>('/api/offers/mine', { role: 'SELLER' })
      setRows(await resolveRows(offers))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setRows([])
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load offers.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!highlightOfferId || rows.length === 0) return
    document.getElementById(`offer-${highlightOfferId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightOfferId, rows])

  const respond = async (offerId: string, action: 'accept' | 'reject') => {
    setActions((prev) => ({ ...prev, [offerId]: action === 'accept' ? 'accepting' : 'rejecting' }))
    try {
      await api.post(`/api/offers/${offerId}/${action}`)
      await load()
      setActions((prev) => {
        const next = { ...prev }
        delete next[offerId]
        return next
      })
      toast.success(action === 'accept' ? 'Offer accepted.' : 'Offer rejected.')
    } catch (err) {
      setActions((prev) => ({ ...prev, [offerId]: 'error' }))
      setError(err instanceof ApiError ? err.message : 'Could not update the offer.')
    }
  }

  const pending = rows.filter((r) => r.offer.status === 'PENDING')
  const resolved = rows.filter((r) => r.offer.status !== 'PENDING')

  const renderCard = (row: Row) => {
    const { offer } = row
    const state = actions[offer.offerId] ?? 'idle'
    const busy = state === 'accepting' || state === 'rejecting'

    return (
      <article
        className={`offer-card${offer.offerId === highlightOfferId ? ' row-highlight' : ''}`}
        id={`offer-${offer.offerId}`}
        key={offer.offerId}
      >
        <div className="offer-card-top">
          <div>
            <h2>{row.vendorName}</h2>
            {row.vendorLocation && <p className="offer-vendor-location">{row.vendorLocation}</p>}
          </div>
          <span className={`offer-status offer-status-${offer.status.toLowerCase()}`}>
            {humanize(offer.status)}
          </span>
        </div>

        <p className="offer-listing">{row.listingLabel}</p>

        <p className="offer-amount">{formatMoney(offer.offeredAmount, offer.currency)}</p>

        {offer.message && <p className="offer-message">“{offer.message}”</p>}

        <p className="offer-meta">
          Received {formatDate(offer.createdAt)}
          {offer.expiresAt ? ` · expires ${formatDate(offer.expiresAt)}` : ''}
        </p>

        {offer.status === 'PENDING' && (
          <div className="offer-card-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => respond(offer.offerId, 'accept')}
            >
              {state === 'accepting' ? 'Accepting…' : 'Accept'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => respond(offer.offerId, 'reject')}
            >
              {state === 'rejecting' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        )}
        {state === 'error' && <p className="offer-error">Something went wrong — try again.</p>}
      </article>
    )
  }

  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Offers</h1>
          <p>Offers vendors have made to collect the waste you’ve listed.</p>
        </div>

        {loading ? (
          <p className="table-state">Loading offers…</p>
        ) : !hasProfile ? (
          <p className="table-state">Complete your business profile to receive offers.</p>
        ) : error ? (
          <RetryState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <p className="table-state">
            No offers yet. When a vendor offers on one of your listings, it shows up here.
          </p>
        ) : (
          <>
            <section className="offer-section">
              <h2 className="offer-section-title">
                Pending{pending.length > 0 ? ` (${pending.length})` : ''}
              </h2>
              {pending.length === 0 ? (
                <p className="table-state">No offers waiting on you.</p>
              ) : (
                <div className="offer-grid">{pending.map(renderCard)}</div>
              )}
            </section>

            {resolved.length > 0 && (
              <section className="offer-section">
                <h2 className="offer-section-title">History</h2>
                <div className="offer-grid">{resolved.map(renderCard)}</div>
              </section>
            )}
          </>
        )}
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default BusinessOffersPage
