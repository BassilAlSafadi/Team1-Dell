import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import AddFundsModal from '../components/AddFundsModal'
import DealsPanel from '../components/DealsPanel'
import RetryState from '../components/RetryState'
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

type WalletResponse = {
  walletId: string
  userId: string
  balance: number
  currency: string
  status: string
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

// The deals endpoint is scoped to the signed-in user's own marketplace accounts server-side,
// so there is no longer a party id to pass (and passing one used to expose other users' deals).
async function fetchMyDeals(): Promise<DealResponse[]> {
  try {
    return await api.get<DealResponse[]>('/api/deals/mine')
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

/** 404 means the wallet hasn't been opened yet — that's a zero balance, not an error. */
async function fetchWallet(): Promise<WalletResponse | null> {
  try {
    return await api.get<WalletResponse>('/api/wallets/me')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring off sortTs
    .map(({ sortTs, ...row }) => row)
}

function TransactionsPage() {
  // Set when arriving from a "deal status changed" notification click — highlights and
  // scrolls to that row once it's loaded, so clicking the notification actually shows
  // you the deal it was about instead of just landing on the page.
  const location = useLocation()
  const highlightDealId = (location.state as { highlightDealId?: string } | null)?.highlightDealId
  const highlightRowId = highlightDealId ? `deal-${highlightDealId}` : null

  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [deals, setDeals] = useState<DealResponse[]>([])
  const [walletTx, setWalletTx] = useState<WalletTransactionResponse[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [currency, setCurrency] = useState('EGP')
  const [isAddFundsOpen, setIsAddFundsOpen] = useState(false)

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
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions.')
      setLoading(false)
      return
    }

    setHasProfile(true)

    try {
      const [dealsResult, walletTxResult, wallet] = await Promise.all([
        fetchMyDeals(),
        fetchWalletTransactions(),
        fetchWallet(),
      ])
      setDeals(dealsResult)
      setWalletTx(walletTxResult)
      setRows(mergeRows(dealsResult, walletTxResult))
      setBalance(wallet?.balance ?? 0)
      if (wallet) setCurrency(wallet.currency)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!highlightRowId || rows.length === 0) return
    document.getElementById(highlightRowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightRowId, rows])

  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Transactions</h1>
          <p>Your full sales, redemptions, and scan history.</p>
        </div>

        <div className="panel wallet-panel">
          <div className="wallet-panel-balance">
            <p className="wallet-panel-label">Wallet balance</p>
            <p className="wallet-panel-value">
              {balance === null
                ? '…'
                : `${balance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} ${currency}`}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setIsAddFundsOpen(true)}>
            Add Funds
          </button>
        </div>

        {!loading && hasProfile && (
          <DealsPanel role="seller" deals={deals} walletTx={walletTx} onChanged={load} />
        )}

        <div className="panel transactions-table-panel">
          {loading ? (
            <p className="table-state table-state-centered">Loading transactions…</p>
          ) : !hasProfile ? (
            <p className="table-state table-state-centered">
              Complete your business profile to see transactions.
            </p>
          ) : error ? (
            <RetryState message={error} onRetry={load} centered />
          ) : rows.length === 0 ? (
            <p className="table-state table-state-centered">No transactions yet.</p>
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
                  <tr key={tx.id} id={tx.id} className={tx.id === highlightRowId ? 'row-highlight' : undefined}>
                    <td data-label="Date">{tx.date}</td>
                    <td data-label="Description">{tx.description}</td>
                    <td data-label="Type">{tx.type}</td>
                    <td
                      data-label="Amount"
                      className={tx.amount.startsWith('-') ? 'amount-negative' : 'amount-positive'}
                    >
                      {tx.amount}
                    </td>
                    <td data-label="Status">
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

      {isAddFundsOpen && (
        <AddFundsModal
          onClose={() => setIsAddFundsOpen(false)}
          onFunded={() => load()}
        />
      )}

      <ChatbotWidget />
    </div>
  )
}

export default TransactionsPage
