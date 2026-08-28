import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { toast } from '../lib/toast'
import './DealsPanel.css'

export type DealResponse = {
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

export type WalletTx = {
  dealId: string | null
  type: string
}

type Role = 'buyer' | 'seller'

type DealsPanelProps = {
  role: Role
  deals: DealResponse[]
  /** The caller's own wallet transactions — used to tell whether a deal has been paid. */
  walletTx: WalletTx[]
  /** Refetch deals + wallet + transactions together so the whole page stays consistent. */
  onChanged: () => void | Promise<void>
}

const ACTIVE_STATUSES = new Set(['AGREED', 'HANDOVER_PENDING', 'DISPUTED'])

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

function DealsPanel({ role, deals, walletTx, onChanged }: DealsPanelProps) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(
    () => deals.filter((d) => ACTIVE_STATUSES.has(d.status)),
    [deals],
  )

  // Resolve the counterparty account id to a display name: for a buyer that's the seller
  // (a business), for a seller that's the buyer (a vendor).
  useEffect(() => {
    let cancelled = false
    const ids = Array.from(
      new Set(active.map((d) => (role === 'buyer' ? d.sellerId : d.buyerId))),
    ).filter((id) => !(id in names))
    if (ids.length === 0) return

    const path = role === 'buyer' ? '/api/corporate-profiles' : '/api/vendor-profiles'
    const field = role === 'buyer' ? 'companyName' : 'vendorName'

    Promise.all(
      ids.map((id) =>
        api
          .get<Record<string, string>>(`${path}/${id}`)
          .then((p) => [id, p[field] ?? 'Unknown'] as const)
          .catch(() => [id, 'Unknown'] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    })

    return () => {
      cancelled = true
    }
  }, [active, role, names])

  const isPaid = (dealId: string) =>
    walletTx.some((t) => t.dealId === dealId && t.type === 'PAYMENT')

  const run = async (dealId: string, fn: () => Promise<unknown>, successMessage?: string) => {
    setBusy((p) => ({ ...p, [dealId]: true }))
    setError(null)
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
      await onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the deal.')
    } finally {
      setBusy((p) => ({ ...p, [dealId]: false }))
    }
  }

  const pay = (d: DealResponse) =>
    run(
      d.dealId,
      () => api.post('/api/wallets/me/pay', { dealId: d.dealId }),
      `Paid ${money(d.agreedAmount, d.currency)}.`,
    )

  const TRANSITION_MESSAGES: Record<string, string> = {
    HANDOVER_PENDING: 'Marked as handed over.',
    COMPLETED: 'Deal completed — payment released.',
    CANCELLED: 'Deal cancelled.',
  }

  const transition = (d: DealResponse, newStatus: string) =>
    run(
      d.dealId,
      () => api.post(`/api/deals/${d.dealId}/transition`, { newStatus }),
      TRANSITION_MESSAGES[newStatus],
    )

  if (active.length === 0) return null

  return (
    <div className="panel deals-panel">
      <h2 className="deals-panel-title">Active deals</h2>
      {error && <p className="deals-panel-error">{error}</p>}

      <div className="deals-list">
        {active.map((d) => {
          const counterparty = names[role === 'buyer' ? d.sellerId : d.buyerId] ?? '…'
          const working = busy[d.dealId] ?? false
          const paid = isPaid(d.dealId)

          return (
            <div className="deal-row" key={d.dealId}>
              <div className="deal-row-info">
                <p className="deal-row-party">{counterparty}</p>
                <p className="deal-row-meta">
                  {money(d.agreedAmount, d.currency)} · <span>{humanize(d.status)}</span>
                  {role === 'buyer' && d.status === 'AGREED' && (
                    <span className={paid ? ' deal-tag-paid' : ' deal-tag-unpaid'}>
                      {paid ? ' · Paid' : ' · Not paid'}
                    </span>
                  )}
                </p>
              </div>

              <div className="deal-row-actions">
                {role === 'buyer' && d.status === 'AGREED' && !paid && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={working}
                    onClick={() => pay(d)}
                  >
                    {working ? 'Paying…' : `Pay ${money(d.agreedAmount, d.currency)}`}
                  </button>
                )}
                {role === 'buyer' && d.status === 'AGREED' && paid && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={working}
                    onClick={() => transition(d, 'HANDOVER_PENDING')}
                  >
                    {working ? 'Saving…' : 'Mark as handed over'}
                  </button>
                )}
                {role === 'buyer' && d.status === 'HANDOVER_PENDING' && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={working}
                    onClick={() => transition(d, 'COMPLETED')}
                  >
                    {working ? 'Saving…' : 'Confirm received & release payment'}
                  </button>
                )}
                {role === 'seller' && (
                  <span className="deal-row-waiting">
                    {d.status === 'AGREED'
                      ? 'Waiting for the vendor to pay'
                      : 'Waiting for the vendor to confirm receipt'}
                  </span>
                )}

                {(d.status === 'AGREED' || d.status === 'HANDOVER_PENDING') && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={working}
                    onClick={() => transition(d, 'CANCELLED')}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DealsPanel
