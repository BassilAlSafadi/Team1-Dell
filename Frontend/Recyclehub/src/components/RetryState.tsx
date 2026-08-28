/**
 * The error counterpart to an empty-state message: same slot in the layout, but red and
 * paired with a retry button wired to the page's own load callback. Keeps a failed
 * request from reading identically to "you have nothing yet".
 */
type RetryStateProps = {
  message: string
  onRetry: () => void
  /** Match the padding/centering of the empty-state text it replaces. */
  centered?: boolean
}

function RetryState({ message, onRetry, centered = false }: RetryStateProps) {
  return (
    <div className={`table-state table-state-error${centered ? ' table-state-centered' : ''}`}>
      <p>{message}</p>
      <button type="button" className="btn-secondary table-state-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

export default RetryState
