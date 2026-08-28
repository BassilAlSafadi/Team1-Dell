import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import RetryState from '../components/RetryState'
import { api, ApiError } from '../lib/api'
import './FindBusinessesPage.css'

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

type MessageState = 'idle' | 'loading' | 'error'
type ConversationDto = { _id: string }

function FindBusinessesPage() {
  const navigate = useNavigate()
  const [businesses, setBusinesses] = useState<CorporateProfileResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messageState, setMessageState] = useState<Record<string, MessageState>>({})
  const [messageError, setMessageError] = useState<Record<string, string>>({})

  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')

  async function search(q: string, cityFilter: string) {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<CorporateProfileResponse[]>('/api/corporate-profiles', {
        q: q || undefined,
        city: cityFilter || undefined,
      })
      setBusinesses(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load businesses.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    search('', '')
  }, [])

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    search(query.trim(), city.trim())
  }

  const handleMessage = async (business: CorporateProfileResponse) => {
    setMessageState((prev) => ({ ...prev, [business.userId]: 'loading' }))
    setMessageError((prev) => {
      const next = { ...prev }
      delete next[business.userId]
      return next
    })
    try {
      // I'm the vendor initiating contact here, so tag roles explicitly rather than relying
      // on the endpoint's defaults (which assume the caller is the vendor's counterpart).
      const conversation = await api.post<ConversationDto>('/api/conversations', {
        participantUserId: business.userId,
        participantRole: 'vendor',
        otherParticipantRole: 'corporate',
      })
      navigate('/messages', { state: { conversationId: conversation._id } })
    } catch (err) {
      setMessageState((prev) => ({ ...prev, [business.userId]: 'error' }))
      setMessageError((prev) => ({
        ...prev,
        [business.userId]: err instanceof ApiError ? err.message : 'Failed to start conversation.',
      }))
    }
  }

  return (
    <div className="page">
      <Navbar variant="vendor" />

      <main className="app-main">
        <div className="page-header">
          <h1>Find Businesses</h1>
          <p>Search for businesses to reach out to about their recycling needs.</p>
        </div>

        <form className="business-search" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search by company name…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search by company name"
          />
          <input
            type="text"
            placeholder="City or location…"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            aria-label="Filter by city"
          />
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>

        {isLoading ? (
          <p className="vendor-status">Loading businesses…</p>
        ) : error ? (
          <RetryState message={error} onRetry={() => search(query.trim(), city.trim())} />
        ) : businesses.length === 0 ? (
          <p className="vendor-status">No businesses found.</p>
        ) : (
          <div className="vendor-grid">
            {businesses.map((business) => {
              const state = messageState[business.userId] ?? 'idle'
              return (
                <article className="vendor-card" key={business.corporateId}>
                  <div className="vendor-card-top">
                    <h2>{business.companyName}</h2>
                    {business.industry && <span className="vendor-rating">{business.industry}</span>}
                  </div>

                  <p className="vendor-location">{business.locationText || 'Location not specified'}</p>

                  {business.description && <p className="business-description">{business.description}</p>}

                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={state === 'loading'}
                    onClick={() => handleMessage(business)}
                  >
                    {state === 'loading' ? 'Opening…' : 'Message Business'}
                  </button>
                  {state === 'error' && (
                    <p className="vendor-contact-error">{messageError[business.userId]}</p>
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

export default FindBusinessesPage
