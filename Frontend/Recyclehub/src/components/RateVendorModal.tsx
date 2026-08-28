import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { useModal } from '../lib/useModal'
import { toast } from '../lib/toast'
import './RateVendorModal.css'

type ReviewResponse = {
  reviewId: string
  vendorId: string
  reviewerId: string
  rating: number
  comment: string | null
}

type VendorReviewsResponse = {
  reviews: ReviewResponse[]
}

type RateVendorModalProps = {
  vendorName: string
  /** The vendor's auth user id — the reviews endpoint is keyed on it, not the marketplace id. */
  vendorUserId: string
  reviewerUserId: string
  onClose: () => void
  onRated: () => void
}

function RateVendorModal({
  vendorName,
  vendorUserId,
  reviewerUserId,
  onClose,
  onRated,
}: RateVendorModalProps) {
  const containerRef = useModal(onClose)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [existing, setExisting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill if the reviewer has already rated this vendor — PUT is an upsert, so this
  // becomes an edit.
  useEffect(() => {
    let cancelled = false
    api
      .get<VendorReviewsResponse>(`/api/vendors/${vendorUserId}/reviews`, { pageSize: 50 })
      .then((data) => {
        if (cancelled) return
        const mine = data.reviews.find((r) => r.reviewerId === reviewerUserId)
        if (mine) {
          setRating(mine.rating)
          setComment(mine.comment ?? '')
          setExisting(true)
        }
      })
      .catch(() => {
        /* first-time review — nothing to pre-fill */
      })
    return () => {
      cancelled = true
    }
  }, [vendorUserId, reviewerUserId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (rating < 1) {
      setError('Pick a star rating.')
      return
    }
    setIsSubmitting(true)
    try {
      await api.put(`/api/vendors/${vendorUserId}/reviews`, {
        rating,
        comment: comment.trim() || null,
      })
      toast.success(existing ? 'Review updated.' : 'Thanks for your review.')
      onRated()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your review. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleRemove = async () => {
    setError(null)
    setIsRemoving(true)
    try {
      await api.delete(`/api/vendors/${vendorUserId}/reviews`)
      toast.success('Review removed.')
      onRated()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove your review.')
      setIsRemoving(false)
    }
  }

  const shown = hover || rating

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${vendorName}`}
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Rate {vendorName}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="rate-stars" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={`rate-star${star <= shown ? ' is-on' : ''}`}
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
                aria-pressed={star === rating}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
              >
                ★
              </button>
            ))}
          </div>

          <label htmlFor="review-comment">Comment (optional)</label>
          <textarea
            id="review-comment"
            name="comment"
            rows={4}
            placeholder="How was working with this vendor?"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            {existing && (
              <button
                type="button"
                className="btn-secondary rate-remove"
                onClick={handleRemove}
                disabled={isSubmitting || isRemoving}
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting || isRemoving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || isRemoving}>
              {isSubmitting ? 'Saving…' : existing ? 'Update review' : 'Submit review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RateVendorModal
