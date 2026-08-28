import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { useModal } from '../lib/useModal'
import { toast } from '../lib/toast'
import './AddWasteModal.css'

type CategoryResponse = {
  categoryId: number
  name: string
  description: string | null
  parentCategoryId: number | null
}

type AddWasteModalProps = {
  onClose: () => void
  onCreated?: () => void
}

function AddWasteModal({ onClose, onCreated = () => {} }: AddWasteModalProps) {
  const containerRef = useModal(onClose)
  const [submitted, setSubmitted] = useState(false)
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<CategoryResponse[]>('/api/categories')
      .then((data) => {
        if (!cancelled) setCategories(data)
      })
      .catch(() => {
        // Categories failing to load isn't fatal on its own — submit will surface
        // a clear error if it can't resolve a category id.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const wasteType = String(formData.get('wasteType') ?? '')
    const weight = Number(formData.get('weight'))
    const notes = String(formData.get('notes') ?? '').trim()

    const category = categories.find((c) => c.name === wasteType)
    if (!category) {
      setError('Could not resolve a category for this waste type. Please try again.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/api/listings', {
        title: wasteType,
        description: notes || undefined,
        categoryId: category.categoryId,
        condition: 'MIXED',
        quantity: weight,
        unit: 'KG',
      })
      setSubmitted(true)
      toast.success('Waste item logged.')
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log waste item. Please try again.')
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
        aria-label="Add waste manually"
        ref={containerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Add Waste Manually</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="modal-success">
            <p>Waste item logged successfully.</p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="modal-form" onSubmit={handleSubmit}>
            <label htmlFor="waste-type">Waste type</label>
            <select id="waste-type" name="wasteType" defaultValue="Plastic" required>
              <option>Plastic</option>
              <option>Glass</option>
              <option>Metal</option>
              <option>Cardboard</option>
              <option>Paper</option>
              <option>Other</option>
            </select>

            <label htmlFor="weight">Weight (kg)</label>
            <input id="weight" name="weight" type="number" step="0.1" min="0" required />

            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" rows={3} />

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Item'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default AddWasteModal
