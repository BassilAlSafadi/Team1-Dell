import { useCallback, useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import AddWasteModal from '../components/AddWasteModal'
import { api, ApiError } from '../lib/api'
import './MyWastePage.css'

type ListingResponse = {
  listingId: string
  ownerId: string
  title: string
  description: string | null
  categoryId: number
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

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatValue(listing: ListingResponse): string {
  if (listing.expectedAmount === null || listing.expectedAmount === undefined) return '—'
  const currency = listing.currency ?? ''
  return `${listing.expectedAmount} ${currency}`.trim()
}

function MyWastePage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchListings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<ListingResponse[]>('/api/listings/mine')
      setListings(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your waste items.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  return (
    <div className="page">
      <Navbar />

      <main className="app-main mywaste-main">
        <div className="page-header page-header-row">
          <div>
            <h1>My Waste</h1>
            <p>Every item you’ve logged or scanned, in one place.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
            Add Waste Manually
          </button>
        </div>

        <div className="panel mywaste-table-panel">
          {isLoading ? (
            <p className="mywaste-status">Loading your waste items…</p>
          ) : error ? (
            <p className="mywaste-status mywaste-status-error">{error}</p>
          ) : listings.length === 0 ? (
            <p className="mywaste-status">No waste items yet — log your first one.</p>
          ) : (
            <table className="mywaste-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Weight</th>
                  <th>Date Logged</th>
                  <th>Status</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((item) => (
                  <tr key={item.listingId}>
                    <td>{item.categoryName || item.title}</td>
                    <td>{`${item.quantity} ${item.unit}`}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <span className={`status-badge status-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{formatValue(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {isAddModalOpen && (
        <AddWasteModal onClose={() => setIsAddModalOpen(false)} onCreated={fetchListings} />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default MyWastePage
