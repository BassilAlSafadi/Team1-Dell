import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import { api, ApiError } from '../lib/api'
import './TransactionsPage.css'

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

type WalletTransactionResponse = {
  walletTransactionId: string
  walletId: string
  paymentMethodId: string | null
  dealId: string | null
  type: 'TOP_UP' | 'PAYMENT' | 'REFUND' | 'WITHDRAWAL'
  amount: number
  currency: string
  balanceAfter: number
  externalReference: string | null
  status: string
  createdAt: string
  completedAt: string | null
}

type TransactionRow = {
  id: string
  date: string
  description: string
  type: string
  amount: string
  status: string
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

function formatAmount(amount: number, currency: string): string {
  const sign = amount > 0 ? '+' : ''
  const formatted = amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `${sign}${formatted} ${currency}`
}

async function fetchDealsForParty(partyId: string): Promise<DealResponse[]> {
  try {
    return await api.get<DealResponse[]>(`/api/deals/party/${partyId}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}

async function fetchWalletTransactions(): Promise<WalletTransactionResponse[]> {
  try {
    return await api.get<WalletTransactionResponse[]>('/api/wallets/me/transactions')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return []
    throw err
  }
}

function mergeRows(deals: DealResponse[], walletTx: WalletTransactionResponse[]): TransactionRow[] {
  const dealRows = deals.map((deal) => ({
    id: `deal-${deal.dealId}`,
    date: formatDate(deal.createdAt),
    description: 'Marketplace deal',
    type: 'Deal',
    amount: formatAmount(deal.agreedAmount, deal.currency),
    status: humanize(deal.status),
    sortTs: Date.parse(deal.createdAt),
  }))

  const walletRows = walletTx.map((tx) => ({
    id: `wallet-${tx.walletTransactionId}`,
    date: formatDate(tx.createdAt),
    description: humanize(tx.type),
    type: humanize(tx.type),
    amount: formatAmount(tx.amount, tx.currency),
    status: humanize(tx.status),
    sortTs: Date.parse(tx.createdAt),
  }))

  return [...dealRows, ...walletRows]
    .sort((a, b) => b.sortTs - a.sortTs)
    .map(({ sortTs: _sortTs, ...row }) => row)
}

function TransactionsPage() {
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TransactionRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      let corporateId: string
      try {
        const profile = await api.get<CorporateProfileResponse>('/api/corporate-profiles/mine')
        corporateId = profile.corporateId
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (!cancelled) {
            setHasProfile(false)
            setLoading(false)
          }
          return
        }
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load transactions.')
          setLoading(false)
        }
        return
      }

      if (!cancelled) setHasProfile(true)

      try {
        const [deals, walletTx] = await Promise.all([
          fetchDealsForParty(corporateId),
          fetchWalletTransactions(),
        ])
        if (!cancelled) setRows(mergeRows(deals, walletTx))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load transactions.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Transactions</h1>
          <p>Your full sales, redemptions, and scan history.</p>
        </div>

        <div className="panel transactions-table-panel">
          {loading ? (
            <p className="table-state">Loading transactions…</p>
          ) : !hasProfile ? (
            <p className="table-state">
              Complete your business profile to see transactions.
            </p>
          ) : error ? (
            <p className="table-state">{error}</p>
          ) : rows.length === 0 ? (
            <p className="table-state">No transactions yet.</p>
          ) : (
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.date}</td>
                    <td>{tx.description}</td>
                    <td>{tx.type}</td>
                    <td className={tx.amount.startsWith('-') ? 'amount-negative' : 'amount-positive'}>
                      {tx.amount}
                    </td>
                    <td>
                      <span className={`status-badge status-${tx.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default TransactionsPage
