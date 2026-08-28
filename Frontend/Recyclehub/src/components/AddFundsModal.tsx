import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { useModal } from '../lib/useModal'
import { toast } from '../lib/toast'
import './AddFundsModal.css'

type WalletResponse = {
  walletId: string
  userId: string
  balance: number
  currency: string
  status: string
}

type WalletTransactionResponse = {
  walletTransactionId: string
  amount: number
  currency: string
  balanceAfter: number
  status: string
}

/** Offered as one-tap amounts so the common case doesn't need the keyboard. */
const QUICK_AMOUNTS = [100, 250, 500, 1000]

const DEFAULT_CURRENCY = 'EGP'

type AddFundsModalProps = {
  onClose: () => void
  /** Called after a successful top-up so the opener can refresh its balance. */
  onFunded?: (newBalance: number, currency: string) => void
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

function AddFundsModal({ onClose, onFunded = () => {} }: AddFundsModalProps) {
  const containerRef = useModal(onClose)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [balance, setBalance] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newBalance, setNewBalance] = useState<number | null>(null)

  // A user who has never added funds has no wallet row yet — a 404 here just means "starting
  // from zero", and the top-up itself opens the wallet server-side.
  useEffect(() => {
    let cancelled = false
    api
      .get<WalletResponse>('/api/wallets/me')
      .then((wallet) => {
        if (cancelled) return
        setBalance(wallet.balance)
        setCurrency(wallet.currency)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setBalance(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    setIsSubmitting(true)
    try {
      const tx = await api.post<WalletTransactionResponse>('/api/wallets/me/top-up', {
        amount: parsed,
        currency,
      })
      setNewBalance(tx.balanceAfter)
      toast.success(`Added ${formatMoney(parsed, tx.currency)}.`)
      onFunded(tx.balanceAfter, tx.currency)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add funds. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Add funds to your wallet"
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Add Funds</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {newBalance !== null ? (
          <div className="modal-success">
            <p>Funds added successfully.</p>
            <p className="add-funds-new-balance">{formatMoney(newBalance, currency)}</p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <div className="add-funds-balance">
              <span>Current balance</span>
              <strong>{balance === null ? '…' : formatMoney(balance, currency)}</strong>
            </div>

            <label htmlFor="add-funds-amount">Amount to add</label>
            <div className="add-funds-amount-row">
              <input
                id="add-funds-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                autoFocus
              />
              <span className="add-funds-currency">{currency}</span>
            </div>

            <div className="add-funds-quick">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`add-funds-chip${Number(amount) === value ? ' is-selected' : ''}`}
                  onClick={() => setAmount(String(value))}
                >
                  +{value.toLocaleString('en-US')}
                </button>
              ))}
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Adding…' : 'Add Funds'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default AddFundsModal
