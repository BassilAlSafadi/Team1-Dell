import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import './VendorDashboardPage.css'

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

type AuthVendorProfileResponse = {
  vendorId: string
  email: string
  status: string
  averageRating: number
  reviewCount: number
}

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

type DealResponse = {
  dealId: string
  offerId: string
  listingId: string
  buyerId: string
  sellerId: string
  agreedAmount: number
  currency: string
  status: 'AGREED' | 'HANDOVER_PENDING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED'
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
}

type Stat = { label: string; value: string; icon: ReactElement }

type ActivityItem = { id: string; title: string; date: string; sortTs: number }

type Profile = {
  name: string
  category: string
  location: string
  memberSince: string
  rating: number
  reviews: number
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function plainAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
}

const requestsFulfilledIcon = (
  <path
    d="M8 24l10 10L40 12"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
)

const totalEarningsIcon = (
  <>
    <rect x="6" y="12" width="36" height="26" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <path d="M6 20h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="32" cy="29" r="3" fill="currentColor" />
  </>
)

const offersSentIcon = (
  <path
    d="M8 38h32M8 34l9-10 7 6 15-16M31 12h8v8"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
)

const ratingIcon = (
  <path
    d="M24 6l5.5 11.2 12.4 1.8-9 8.8 2.1 12.3L24 34l-11 6.1 2.1-12.3-9-8.8 12.4-1.8L24 6Z"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinejoin="round"
  />
)

function VendorDashboardPage() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stat[]>([])
  const [recentRequests, setRecentRequests] = useState<ActivityItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      let vendorProfile: VendorProfileResponse
      try {
        vendorProfile = await api.get<VendorProfileResponse>('/api/vendor-profiles/mine')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (!cancelled) {
            setHasProfile(false)
            setLoading(false)
          }
          return
        }
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.')
          setLoading(false)
        }
        return
      }

      if (!cancelled) setHasProfile(true)

      try {
        const [offers, deals, authProfile] = await Promise.all([
          api.get<OfferResponse[]>(`/api/offers/buyer/${vendorProfile.vendorId}`).catch((err) => {
            if (err instanceof ApiError && err.status === 404) return [] as OfferResponse[]
            throw err
          }),
          api.get<DealResponse[]>(`/api/deals/party/${vendorProfile.vendorId}`).catch((err) => {
            if (err instanceof ApiError && err.status === 404) return [] as DealResponse[]
            throw err
          }),
          user
            ? api.get<AuthVendorProfileResponse>(`/api/vendors/${user.userId}/profile`).catch((err) => {
                if (err instanceof ApiError) return null
                throw err
              })
            : Promise.resolve(null),
        ])

        if (cancelled) return

        const completedDeals = deals.filter((deal) => deal.status === 'COMPLETED')
        const earningsCurrency = completedDeals[0]?.currency ?? 'EGP'
        const totalEarnings = completedDeals.reduce((sum, deal) => sum + deal.agreedAmount, 0)

        setStats([
          {
            label: 'Requests Fulfilled',
            value: String(completedDeals.length),
            icon: requestsFulfilledIcon,
          },
          {
            label: 'Total Earnings',
            value: plainAmount(totalEarnings, earningsCurrency),
            icon: totalEarningsIcon,
          },
          {
            label: 'Offers Sent',
            value: String(offers.length),
            icon: offersSentIcon,
          },
          {
            label: 'Rating',
            value: `${(authProfile?.averageRating ?? 0).toFixed(1)} ★`,
            icon: ratingIcon,
          },
        ])

        const offerActivity: ActivityItem[] = offers.map((offer) => ({
          id: `offer-${offer.offerId}`,
          title: `Offer ${humanize(offer.status)} — ${plainAmount(offer.offeredAmount, offer.currency)}`,
          date: formatDate(offer.createdAt),
          sortTs: Date.parse(offer.createdAt),
        }))
        const dealActivity: ActivityItem[] = deals.map((deal) => ({
          id: `deal-${deal.dealId}`,
          title: `Deal ${humanize(deal.status)} — ${plainAmount(deal.agreedAmount, deal.currency)}`,
          date: formatDate(deal.createdAt),
          sortTs: Date.parse(deal.createdAt),
        }))

        setRecentRequests(
          [...offerActivity, ...dealActivity].sort((a, b) => b.sortTs - a.sortTs).slice(0, 4),
        )

        setProfile({
          name: vendorProfile.vendorName,
          category: vendorProfile.categoryPreference ?? '—',
          location: vendorProfile.locationText ?? '—',
          memberSince: String(new Date(vendorProfile.createdAt).getFullYear() || '—'),
          rating: authProfile?.averageRating ?? 0,
          reviews: authProfile?.reviewCount ?? 0,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user])

  if (!loading && !hasProfile) {
    return (
      <div className="page vendor-dashboard-page">
        <Navbar variant="vendor" />
        <main className="dashboard-main">
          <section className="welcome">
            <h1>Complete your vendor profile</h1>
            <p>You need to finish setting up your vendor profile before you can access your dashboard.</p>
          </section>
        </main>
        <ChatbotWidget />
      </div>
    )
  }

  return (
    <div className="page vendor-dashboard-page">
      <Navbar variant="vendor" />

      <main className="dashboard-main">
        <section className="welcome">
          <h1>Welcome back{profile ? `, ${profile.name}` : ''}</h1>
          <p>
            Manage incoming requests, track your transactions, and grow your
            recycling business.
          </p>

          <div className="welcome-actions">
            <Link to="/vendor-requests" className="btn-primary">
              Find Requests
            </Link>
            <Link to="/vendor-transactions" className="btn-secondary">
              View Transactions
            </Link>
          </div>
        </section>

        {loading ? (
          <p className="table-state">Loading your dashboard…</p>
        ) : error ? (
          <p className="table-state">{error}</p>
        ) : (
          <>
            <section className="stats-grid">
              {stats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <span className="stat-icon" aria-hidden="true">
                    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {stat.icon}
                    </svg>
                  </span>
                  <div>
                    <p className="stat-card-label">{stat.label}</p>
                    <p className="stat-card-value">{stat.value}</p>
                  </div>
                </div>
              ))}
            </section>

            <section className="dashboard-grid">
              <div className="panel profile-panel" id="profile">
                <h2>Vendor Profile</h2>

                {profile && (
                  <>
                    <div className="profile-card">
                      <span className="profile-avatar" aria-hidden="true">
                        {profile.name
                          .split(' ')
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join('')}
                      </span>
                      <div>
                        <p className="profile-name">{profile.name}</p>
                        <p className="profile-meta">{profile.category}</p>
                        <p className="profile-meta">
                          {profile.location} · Member since {profile.memberSince}
                        </p>
                      </div>
                    </div>

                    <div className="profile-rating">
                      <span className="stars" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span
                            key={i}
                            className={i < Math.round(profile.rating) ? 'star filled' : 'star'}
                          >
                            ★
                          </span>
                        ))}
                      </span>
                      <span className="rating-value">{profile.rating.toFixed(1)}</span>
                      <span className="rating-count">({profile.reviews} reviews)</span>
                    </div>
                  </>
                )}

                <button type="button" className="btn-secondary">
                  Edit Profile
                </button>
              </div>

              <div className="panel activity-panel">
                <h2>Recent Requests</h2>

                {recentRequests.length === 0 ? (
                  <p className="table-state">No recent activity yet.</p>
                ) : (
                  <ul className="activity-list">
                    {recentRequests.map((item) => (
                      <li key={item.id}>
                        <span className="activity-dot" aria-hidden="true" />
                        <div>
                          <p className="activity-title">{item.title}</p>
                          <p className="activity-date">{item.date}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <Link to="/vendor-requests" className="view-all-link">
                  View All Requests →
                </Link>
              </div>
            </section>
          </>
        )}
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default VendorDashboardPage
