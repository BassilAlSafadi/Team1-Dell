import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { useModal } from '../lib/useModal'
import { toast } from '../lib/toast'
import './AddFundsModal.css'

type WalletResponse = { balance: number; currency: string }

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

type MakeOfferModalProps = {
  listingTitle: string
  /** Suggested amount — the business's expected value for the listing, if it set one. */
  suggestedAmount: number | null
  currency: string
  onClose: () => void
  onSubmit: (amount: number, currency: string, message: string) => Promise<void>
}

function MakeOfferModal({
  listingTitle,
  suggestedAmount,
  currency,
  onClose,
  onSubmit,
}: MakeOfferModalProps) {
  const containerRef = useModal(onClose)
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount) : '')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  // The vendor pays their offer amount the moment the business accepts it, so an offer above
  // the current wallet balance can never be honoured — block it here.
  useEffect(() => {
    let cancelled = false
    api
      .get<WalletResponse>('/api/wallets/me')
      .then((wallet) => {
        if (!cancelled) setBalance(wallet.balance)
      })
      .catch((err) => {
        if (cancelled) return
        // 404 = no wallet opened yet -> treat as a zero balance.
        setBalance(err instanceof ApiError && err.status === 404 ? 0 : null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const parsedAmount = Number(amount)
  const overBalance =
    balance !== null && Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount > balance

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    if (overBalance) {
      setError(
        `That's more than your wallet balance (${formatMoney(balance ?? 0, currency)}). Add funds first.`,
      )
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(parsedAmount, currency, message.trim())
      toast.success('Offer sent.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the offer. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Make an offer"
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Make an offer</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <p className="add-funds-balance">
            <span>Listing</span>
            <strong>{listingTitle}</strong>
          </p>

          <p className="add-funds-balance">
            <span>Your wallet balance</span>
            <strong>{balance === null ? '…' : formatMoney(balance, currency)}</strong>
          </p>

          <label htmlFor="offer-amount">
            Your offer{suggestedAmount ? ` (business expects ${suggestedAmount} ${currency})` : ''}
          </label>
          <div className="add-funds-amount-row">
            <input
              id="offer-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={balance ?? undefined}
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              autoFocus
            />
            <span className="add-funds-currency">{currency}</span>
          </div>
          {overBalance && (
            <p className="modal-error">
              Over your balance — you can offer at most {formatMoney(balance ?? 0, currency)}.
            </p>
          )}

          <label htmlFor="offer-message">Message (optional)</label>
          <textarea
            id="offer-message"
            name="message"
            rows={3}
            placeholder="e.g. We can collect within the week."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || overBalance}>
              {isSubmitting ? 'Sending…' : 'Send offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MakeOfferModal
