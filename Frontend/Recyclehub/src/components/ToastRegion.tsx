import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type ToastItem } from '../lib/toast'

/** Mounted once in App.tsx so it persists across route changes. Renders nothing
 * when the queue is empty — most of the app's life. */
function ToastRegion() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div className={`toast toast-${item.kind}`} key={item.id}>
          <span className="toast-icon" aria-hidden="true">
            {item.kind === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7.5v5.5M12 16.2v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <p className="toast-message">{item.message}</p>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(item.id)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastRegion
