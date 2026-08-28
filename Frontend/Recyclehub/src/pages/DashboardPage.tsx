import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import AddWasteModal from '../components/AddWasteModal'
import AddFundsModal from '../components/AddFundsModal'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import './DashboardPage.css'

type CategoryResponse = {
  categoryId: number
  name: string
  description: string | null
  parentCategoryId: number | null
}

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

type WalletResponse = {
  walletId: string
  userId: string
  balance: number
  currency: string
  status: string
  createdAt: string
  updatedAt: string
}

type DealResponse = {
  dealId: string
  offerId: string
  listingId: string
  buyerId: string
  sellerId: string
  agreedAmount: number
  currency: string
  status: string
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
}

type CorporateProfileResponse = {
  corporateId: string
  companyName?: string
}

type ClassifyItem = {
  description: string
  category: string
  confidence: number
  materialEvidence: string
}

type ClassifyResponse = {
  classificationId: string
  primaryCategory: string
  confidence: number
  items: ClassifyItem[]
  isMixed: boolean
  hazardFlag: boolean
  hazardReason: string | null
  contaminationNotes: string | null
  reasoning: string | null
  needsReview: boolean
  vendorsByCategory: Record<
    string,
    { name: string; offerPrice: number; location: string; pickupAvailable: boolean }[]
  >
}

type ActivityItem = { title: string; date: string }
type ImpactPoint = { key: string; month: string; kg: number }

const STAT_ICONS = [
  (
    <path
      key="waste"
      d="M8 38h32M8 34l9-10 7 6 15-16M31 12h8v8"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  (
    <g key="earnings">
      <rect x="6" y="12" width="36" height="26" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 20h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="29" r="3" fill="currentColor" />
    </g>
  ),
  (
    <path
      key="co2e"
      d="M24 6c5 4 8 9 8 15a8 8 0 1 1-16 0c0-6 3-11 8-15Z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
  ),
  (
    <path
      key="transactions"
      d="M12 8h24v32l-6-4-6 4-6-4-6 4V8Z M18 18h12M18 26h12"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
]

function formatDateShort(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DashboardPage() {
  const location = useLocation()
  const { user } = useAuth()
  const scannerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [walletCurrency, setWalletCurrency] = useState('EGP')
  const [deals, setDeals] = useState<DealResponse[]>([])
  const [companyName, setCompanyName] = useState<string | undefined>(undefined)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)

  const [classification, setClassification] = useState<ClassifyResponse | null>(null)
  const [isClassifying, setIsClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [logQuantity, setLogQuantity] = useState(1)
  const [isLoggingClassification, setIsLoggingClassification] = useState(false)
  const [logMessage, setLogMessage] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)

  const fetchDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true)
    try {
      const [categoriesResult, listingsResult, walletResult, corporateResult] = await Promise.allSettled([
        api.get<CategoryResponse[]>('/api/categories'),
        api.get<ListingResponse[]>('/api/listings/mine'),
        api.get<WalletResponse>('/api/wallets/me'),
        api.get<CorporateProfileResponse>('/api/corporate-profiles/mine'),
      ])

      if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value)
      if (listingsResult.status === 'fulfilled') setListings(listingsResult.value)

      if (walletResult.status === 'fulfilled') {
        setWalletBalance(walletResult.value.balance)
        setWalletCurrency(walletResult.value.currency)
      } else {
        setWalletBalance(0)
      }

      if (corporateResult.status === 'fulfilled') {
        setCompanyName(corporateResult.value.companyName)
        try {
          const partyDeals = await api.get<DealResponse[]>(
            '/api/deals/mine',
          )
          setDeals(partyDeals)
        } catch {
          setDeals([])
        }
      } else {
        setDeals([])
      }
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.hash])

  const handleScanWaste = () => {
    scannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPreviewImage(URL.createObjectURL(file))
    setClassification(null)
    setClassifyError(null)
    setLogMessage(null)
    setLogError(null)
    setIsClassifying(true)

    try {
      const formData = new FormData()
      formData.append('image', file)
      const result = await api.postRaw<ClassifyResponse>('/api/ai/classify', formData)
      setClassification(result)
      setLogQuantity(1)
    } catch (err) {
      setClassifyError(err instanceof ApiError ? err.message : 'Failed to classify this image.')
    } finally {
      setIsClassifying(false)
    }
  }

  const handleLogClassification = async () => {
    if (!classification) return
    setLogMessage(null)
    setLogError(null)

    const lowerPrimary = classification.primaryCategory.trim().toLowerCase()
    const matched =
      categories.find((c) => c.name.toLowerCase() === lowerPrimary) ??
      categories.find((c) => c.name.toLowerCase() === 'other')

    if (!matched) {
      setLogError('Could not resolve a category for this item. Please try again.')
      return
    }

    setIsLoggingClassification(true)
    try {
      await api.post('/api/listings', {
        title: classification.primaryCategory,
        description: classification.reasoning || undefined,
        categoryId: matched.categoryId,
        condition: 'MIXED',
        quantity: logQuantity,
        unit: 'KG',
      })
      setLogMessage('Logged to My Waste.')
      fetchDashboardData()
    } catch (err) {
      setLogError(err instanceof ApiError ? err.message : 'Failed to log this item.')
    } finally {
      setIsLoggingClassification(false)
    }
  }

  const totalKg = listings
    .filter((l) => l.unit === 'KG')
    .reduce((sum, l) => sum + l.quantity, 0)
  const co2eEstimate = totalKg * 0.5
  const stats = [
    { label: 'Total Waste Recycled', value: `${totalKg.toFixed(1)} kg` },
    { label: 'Wallet Balance', value: `${walletBalance.toFixed(2)} ${walletCurrency}` },
    { label: 'CO2e Saved (est.)', value: `${co2eEstimate.toFixed(1)} kg` },
    { label: 'Transactions', value: `${deals.length}` },
  ]

  const activity: ActivityItem[] = [
    ...listings.map((l) => ({
      title: `Logged ${l.quantity} ${l.unit.toLowerCase()} ${l.categoryName || l.title}`,
      date: l.createdAt,
    })),
    ...deals.map((d) => ({
      title:
        d.status === 'COMPLETED'
          ? `Deal completed — ${d.agreedAmount} ${d.currency}`
          : `Deal ${d.status.toLowerCase()}`,
      date: d.completedAt ?? d.cancelledAt ?? d.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const impactMap = new Map<string, ImpactPoint>()
  listings
    .filter((l) => l.unit === 'KG')
    .forEach((l) => {
      const date = new Date(l.createdAt)
      if (Number.isNaN(date.getTime())) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const month = date.toLocaleDateString('en-US', { month: 'short' })
      const existing = impactMap.get(key)
      if (existing) {
        existing.kg += l.quantity
      } else {
        impactMap.set(key, { key, month, kg: l.quantity })
      }
    })
  const impact = Array.from(impactMap.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
  const maxImpact = Math.max(1, ...impact.map((m) => m.kg))

  const greetingName = companyName || user?.email || 'there'

  return (
    <div className="page dashboard-page">
      <Navbar />

      <main className="dashboard-main">
        <section className="welcome">
          <h1>Welcome back, {greetingName}</h1>
          <p>
            Turn your waste into value. Identify recyclables instantly and trade
            with registered local vendors.
          </p>

          <div className="welcome-actions">
            <button type="button" className="btn-primary" onClick={handleScanWaste}>
              Scan Waste
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Waste Manually
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsAddFundsOpen(true)}
            >
              Add Funds
            </button>
          </div>
        </section>

        <section className="stats-grid">
          {stats.map((stat, index) => (
            <div className="stat-card" key={stat.label}>
              <span className="stat-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {STAT_ICONS[index]}
                </svg>
              </span>
              <div>
                <p className="stat-card-label">{stat.label}</p>
                {isLoadingDashboard ? (
                  <span className="skeleton stat-card-value-skeleton" aria-hidden="true" />
                ) : (
                  <p className="stat-card-value">{stat.value}</p>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="dashboard-grid">
          <div className="panel scanner-panel" id="scanner" ref={scannerRef}>
            <h2>AI Waste Scanner</h2>

            <div className="dropzone">
              {previewImage ? (
                <img src={previewImage} alt="Selected waste" className="dropzone-preview" />
              ) : (
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="6"
                    y="10"
                    width="36"
                    height="28"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="17" cy="20" r="3.5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M6 32l10-10 7 7 6-6 13 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <p className="scanner-hint">
              Point your camera or upload an image to identify waste type,
              recyclability score, and estimated market value instantly.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden"
              onChange={handleImageSelected}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isClassifying}
            >
              {isClassifying ? 'Scanning…' : previewImage ? 'Replace Image' : 'Upload Image'}
            </button>

            {classifyError && <p className="scanner-error">{classifyError}</p>}

            {classification && (
              <div className="scanner-result">
                <div className="scanner-result-header">
                  <h3>{classification.primaryCategory}</h3>
                  <span className="scanner-confidence">
                    {Math.round(classification.confidence * 100)}% confidence
                  </span>
                </div>

                {classification.hazardFlag && (
                  <p className="scanner-hazard">
                    ⚠ Hazard: {classification.hazardReason || 'Handle with care.'}
                  </p>
                )}

                {classification.contaminationNotes && (
                  <p className="scanner-note">{classification.contaminationNotes}</p>
                )}

                {classification.items.length > 0 && (
                  <ul className="scanner-items-list">
                    {classification.items.map((item, idx) => (
                      <li key={`${item.description}-${idx}`}>
                        {item.description} — {item.category} (
                        {Math.round(item.confidence * 100)}%)
                      </li>
                    ))}
                  </ul>
                )}

                <div className="scanner-log-row">
                  <label htmlFor="log-quantity">Quantity (kg)</label>
                  <input
                    id="log-quantity"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={logQuantity}
                    onChange={(e) => setLogQuantity(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleLogClassification}
                    disabled={isLoggingClassification}
                  >
                    {isLoggingClassification ? 'Logging…' : 'Log to My Waste'}
                  </button>
                </div>

                {logMessage && <p className="scanner-log-success">{logMessage}</p>}
                {logError && <p className="scanner-error">{logError}</p>}
              </div>
            )}
          </div>

          <div className="panel activity-panel">
            <h2>Recent Activity</h2>

            {activity.length === 0 ? (
              <p className="activity-empty">No activity yet — log or scan some waste to get started.</p>
            ) : (
              <ul className="activity-list">
                {activity.map((item) => (
                  <li key={`${item.title}-${item.date}`}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div>
                      <p className="activity-title">{item.title}</p>
                      <p className="activity-date">{formatDateShort(item.date)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Link to="/transactions" className="view-all-link">
              View All Transactions →
            </Link>
          </div>
        </section>

        <section className="impact-section" id="impact">
          <h2>Environmental Impact</h2>
          <p className="impact-subtitle">Your monthly recycled weight (measured in kg)</p>

          {impact.length === 0 ? (
            <p className="impact-empty">Log some waste to see your environmental impact over time.</p>
          ) : (
            <div className="impact-chart">
              {impact.map((m) => (
                <div className="impact-bar-col" key={m.key}>
                  <span className="impact-value">{m.kg.toFixed(1)}kg</span>
                  <div
                    className="impact-bar"
                    style={{ height: `${(m.kg / maxImpact) * 100}%` }}
                  />
                  <span className="impact-month">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {isAddModalOpen && (
        <AddWasteModal onClose={() => setIsAddModalOpen(false)} onCreated={fetchDashboardData} />
      )}

      {isAddFundsOpen && (
        <AddFundsModal onClose={() => setIsAddFundsOpen(false)} onFunded={() => fetchDashboardData()} />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default DashboardPage
