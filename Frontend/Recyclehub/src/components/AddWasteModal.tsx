import { useState, type FormEvent } from 'react'
import './AddWasteModal.css'

type AddWasteModalProps = {
  onClose: () => void
}

function AddWasteModal({ onClose }: AddWasteModalProps) {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-label="Add waste manually"
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

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Item
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default AddWasteModal
