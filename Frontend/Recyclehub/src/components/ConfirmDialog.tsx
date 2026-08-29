import { useState, type ReactNode } from 'react'
import { useModal } from '../lib/useModal'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  title: string
  message: ReactNode
  /** Label for the confirming button. Defaults to "Confirm". */
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as a destructive action. */
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/** A yes/no dialog for actions worth a second look — sign out, discard, etc. Runs `onConfirm`
 * (awaiting it if it's async) and leaves closing to the caller so it can navigate away first. */
function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const containerRef = useModal(onClose)
  const [isBusy, setIsBusy] = useState(false)

  const handleConfirm = async () => {
    setIsBusy(true)
    try {
      await onConfirm()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
        </div>

        <div className="confirm-dialog-body">{message}</div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
