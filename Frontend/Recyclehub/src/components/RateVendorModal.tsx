import { useCallback, useEffect, useState, type FormEvent } from 'react'
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
  createdAt: string
  updatedAt: string
}

type VendorReviewsResponse = {
  averageRating: number
  reviewCount: number
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months} month${months === 1 ? '' : 's'} ago` : `${Math.floor(months / 12)}y ago`
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

  const [reviews, setReviews] = useState<ReviewResponse[]>([])
  const [average, setAverage] = useState(0)
  const [count, setCount] = useState(0)
  const [loadingReviews, setLoadingReviews] = useState(true)

  const loadReviews = useCallback(async () => {
    try {
      const data = await api.get<VendorReviewsResponse>(`/api/vendors/${vendorUserId}/reviews`, {
        pageSize: 50,
      })
      setReviews(data.reviews)
      setAverage(data.averageRating)
      setCount(data.reviewCount)
      const mine = data.reviews.find((r) => r.reviewerId === reviewerUserId)
      if (mine) {
        setRating(mine.rating)
        setComment(mine.comment ?? '')
        setExisting(true)
      } else {
        setExisting(false)
      }
    } catch {
      /* leave the list empty — the form still works for a first review */
    } finally {
      setLoadingReviews(false)
    }
  }, [vendorUserId, reviewerUserId])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

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
      await loadReviews()
      onRated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your review. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemove = async () => {
    setError(null)
    setIsRemoving(true)
    try {
      await api.delete(`/api/vendors/${vendorUserId}/reviews`)
      toast.success('Review removed.')
      setRating(0)
      setComment('')
      await loadReviews()
      onRated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove your review.')
    } finally {
      setIsRemoving(false)
    }
  }

  const shown = hover || rating
  const otherReviews = reviews.filter((r) => r.reviewerId !== reviewerUserId && r.comment)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card rate-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Reviews for ${vendorName}`}
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{vendorName}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="rate-summary">
          {count > 0 ? (
            <>
              <span className="rate-summary-avg">★ {average.toFixed(1)}</span>
              <span>
                {' '}
                from {count} review{count === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span>No reviews yet — be the first.</span>
          )}
        </p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="rate-form-label">{existing ? 'Your review' : 'Leave a review'}</label>
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

          <textarea
            id="review-comment"
            name="comment"
            rows={3}
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
            <button type="submit" className="btn-primary" disabled={isSubmitting || isRemoving}>
              {isSubmitting ? 'Saving…' : existing ? 'Update review' : 'Submit review'}
            </button>
          </div>
        </form>

        <div className="rate-review-list">
          {loadingReviews ? (
            <p className="rate-review-empty">Loading reviews…</p>
          ) : otherReviews.length === 0 ? (
            <p className="rate-review-empty">No written reviews from other businesses yet.</p>
          ) : (
            otherReviews.map((review) => (
              <div className="rate-review" key={review.reviewId}>
                <div className="rate-review-head">
                  <span className="rate-review-stars">{'★'.repeat(review.rating)}</span>
                  <span className="rate-review-date">{timeAgo(review.createdAt)}</span>
                </div>
                <p className="rate-review-comment">{review.comment}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default RateVendorModal
