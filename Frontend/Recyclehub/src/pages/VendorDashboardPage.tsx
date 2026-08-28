import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import AddFundsModal from '../components/AddFundsModal'
import RetryState from '../components/RetryState'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import './VendorDashboardPage.css'

type WalletResponse = { balance: number; currency: string }

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

type EditForm = {
  vendorName: string
  categoryPreference: string
  fulfillmentMethod: string
  operatingHours: string
  locationText: string
  minimumAmount: string
}

function toEditForm(vendor: VendorProfileResponse): EditForm {
  return {
    vendorName: vendor.vendorName,
    categoryPreference: vendor.categoryPreference ?? '',
    fulfillmentMethod: vendor.fulfillmentMethod ?? '',
    operatingHours: vendor.operatingHours ?? '',
    locationText: vendor.locationText ?? '',
    minimumAmount: vendor.minimumAmount != null ? String(vendor.minimumAmount) : '',
  }
}

function VendorDashboardPage() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stat[]>([])
  const [recentRequests, setRecentRequests] = useState<ActivityItem[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [vendorProfile, setVendorProfile] = useState<VendorProfileResponse | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    let vendorProfile: VendorProfileResponse
    try {
      vendorProfile = await api.get<VendorProfileResponse>('/api/vendor-profiles/mine')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setHasProfile(false)
        setLoading(false)
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.')
      setLoading(false)
      return
    }

    setHasProfile(true)

    try {
      const [offers, deals, authProfile, wallet] = await Promise.all([
        api.get<OfferResponse[]>('/api/offers/mine', { role: 'BUYER' }).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return [] as OfferResponse[]
          throw err
        }),
        api.get<DealResponse[]>('/api/deals/mine').catch((err) => {
          if (err instanceof ApiError && err.status === 404) return [] as DealResponse[]
          throw err
        }),
        user
          ? api.get<AuthVendorProfileResponse>(`/api/vendors/${user.userId}/profile`).catch((err) => {
              if (err instanceof ApiError) return null
              throw err
            })
          : Promise.resolve(null),
        // 404 = wallet not opened yet -> zero balance, not an error.
        api.get<WalletResponse>('/api/wallets/me').catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null
          throw err
        }),
      ])

        const completedDeals = deals.filter((deal) => deal.status === 'COMPLETED')

        setStats([
          {
            label: 'Requests Fulfilled',
            value: String(completedDeals.length),
            icon: requestsFulfilledIcon,
          },
          {
            label: 'Wallet Balance',
            value: plainAmount(wallet?.balance ?? 0, wallet?.currency ?? 'EGP'),
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

        setVendorProfile(vendorProfile)
        setProfile({
          name: vendorProfile.vendorName,
          category: vendorProfile.categoryPreference ?? '—',
          location: vendorProfile.locationText ?? '—',
          memberSince: String(new Date(vendorProfile.createdAt).getFullYear() || '—'),
          rating: authProfile?.averageRating ?? 0,
          reviews: authProfile?.reviewCount ?? 0,
        })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your dashboard.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handleEditOpen = () => {
    if (!vendorProfile) return
    setEditForm(toEditForm(vendorProfile))
    setEditError(null)
    setIsEditing(true)
  }

  const handleEditCancel = () => {
    setIsEditing(false)
    setEditError(null)
  }

  const updateEditField = (field: keyof EditForm) => (event: { target: { value: string } }) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: event.target.value } : prev))
  }

  const handleEditSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!editForm) return
    setIsSaving(true)
    setEditError(null)
    try {
      const updated = await api.patch<VendorProfileResponse>('/api/vendor-profiles/mine', {
        vendorName: editForm.vendorName,
        categoryPreference: editForm.categoryPreference || null,
        fulfillmentMethod: editForm.fulfillmentMethod || null,
        operatingHours: editForm.operatingHours || null,
        locationText: editForm.locationText || null,
        minimumAmount: editForm.minimumAmount ? Number(editForm.minimumAmount) : null,
      })
      setVendorProfile(updated)
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: updated.vendorName,
              category: updated.categoryPreference ?? '—',
              location: updated.locationText ?? '—',
            }
          : prev,
      )
      setIsEditing(false)
      toast.success('Profile updated.')
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

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
            <button type="button" className="btn-secondary" onClick={() => setIsAddFundsOpen(true)}>
              Add Funds
            </button>
          </div>
        </section>

        {loading ? (
          <p className="table-state">Loading your dashboard…</p>
        ) : error ? (
          <RetryState message={error} onRetry={loadDashboard} />
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

                {isEditing && editForm ? (
                  <form className="profile-edit-form" onSubmit={handleEditSave}>
                    <label htmlFor="edit-vendorName">Vendor name</label>
                    <input
                      id="edit-vendorName"
                      value={editForm.vendorName}
                      onChange={updateEditField('vendorName')}
                      required
                    />

                    <label htmlFor="edit-category">Category</label>
                    <input
                      id="edit-category"
                      value={editForm.categoryPreference}
                      onChange={updateEditField('categoryPreference')}
                    />

                    <label htmlFor="edit-fulfillment">Drop off or delivery</label>
                    <input
                      id="edit-fulfillment"
                      value={editForm.fulfillmentMethod}
                      onChange={updateEditField('fulfillmentMethod')}
                    />

                    <label htmlFor="edit-hours">Operating hours</label>
                    <input
                      id="edit-hours"
                      value={editForm.operatingHours}
                      onChange={updateEditField('operatingHours')}
                    />

                    <label htmlFor="edit-location">Location</label>
                    <input
                      id="edit-location"
                      value={editForm.locationText}
                      onChange={updateEditField('locationText')}
                    />

                    <label htmlFor="edit-minimum">Minimum amount required</label>
                    <input
                      id="edit-minimum"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.minimumAmount}
                      onChange={updateEditField('minimumAmount')}
                    />

                    {editError && <p className="profile-edit-error">{editError}</p>}

                    <div className="profile-edit-actions">
                      <button type="submit" className="btn-primary" disabled={isSaving}>
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isSaving}
                        onClick={handleEditCancel}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
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

                    <button type="button" className="btn-secondary" onClick={handleEditOpen} disabled={!vendorProfile}>
                      Edit Profile
                    </button>
                  </>
                )}
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

      {isAddFundsOpen && (
        <AddFundsModal
          onClose={() => setIsAddFundsOpen(false)}
          onFunded={() => loadDashboard()}
        />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default VendorDashboardPage
