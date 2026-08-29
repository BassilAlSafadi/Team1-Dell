import { useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { useModal } from '../lib/useModal'
import { toast } from '../lib/toast'
import './ConfirmDialog.css'

type DeleteAccountModalProps = {
  onClose: () => void
  /** Called after the account is deleted and the local session cleared. */
  onDeleted: () => void
}

/** Two gates before an account is destroyed: an explicit "yes, delete" and retyping the
 * account email by hand — paste, drop and autofill are all blocked so the phrase can't be
 * dropped in without reading it. */
function DeleteAccountModal({ onClose, onDeleted }: DeleteAccountModalProps) {
  const { user, deleteAccount } = useAuth()
  const containerRef = useModal(onClose)
  const phrase = user?.email ?? ''

  const [typed, setTyped] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = typed.trim().toLowerCase() === phrase.toLowerCase() && phrase !== ''

  const blockPaste = (event: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>) => {
    event.preventDefault()
    toast.error('Please type your email — pasting is disabled here.')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!matches) return

    setError(null)
    setIsDeleting(true)
    try {
      await deleteAccount(typed.trim())
      toast.success('Your account has been deleted.')
      onDeleted()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not delete your account. Please try again.',
      )
      setIsDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete your account"
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Delete account</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="delete-account-warning">
          This permanently deletes your account and cannot be undone. You will be signed out
          immediately.
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label htmlFor="delete-account-confirm">
            Type <strong>{phrase}</strong> to confirm
          </label>
          <span className="delete-account-phrase" aria-hidden="true">
            {phrase}
          </span>
          <input
            id="delete-account-confirm"
            name="delete-account-confirm"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onPaste={blockPaste}
            onDrop={blockPaste}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
          />

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isDeleting}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={!matches || isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default DeleteAccountModal
