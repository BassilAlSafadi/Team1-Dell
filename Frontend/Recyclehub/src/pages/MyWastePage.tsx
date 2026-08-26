import { useState } from 'react'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import AddWasteModal from '../components/AddWasteModal'
import './MyWastePage.css'

const wasteItems = [
  { id: 1, type: 'Plastic', weight: '2.0 kg', date: 'Oct 24, 2025', status: 'Sold', value: '45 EGP' },
  { id: 2, type: 'Glass', weight: '1.2 kg', date: 'Oct 23, 2025', status: 'Identified', value: '30 EGP' },
  { id: 3, type: 'Cardboard', weight: '10.0 kg', date: 'Oct 18, 2025', status: 'Sold', value: '180 EGP' },
  { id: 4, type: 'Metal', weight: '3.5 kg', date: 'Oct 15, 2025', status: 'Identified', value: '60 EGP' },
  { id: 5, type: 'Paper', weight: '5.0 kg', date: 'Oct 10, 2025', status: 'Pending', value: '—' },
  { id: 6, type: 'Plastic', weight: '4.2 kg', date: 'Oct 6, 2025', status: 'Sold', value: '75 EGP' },
]

function MyWastePage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  return (
    <div className="page">
      <Navbar />

      <main className="app-main mywaste-main">
        <div className="page-header page-header-row">
          <div>
            <h1>My Waste</h1>
            <p>Every item you’ve logged or scanned, in one place.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
            Add Waste Manually
          </button>
        </div>

        <div className="panel mywaste-table-panel">
          <table className="mywaste-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Weight</th>
                <th>Date Logged</th>
                <th>Status</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {wasteItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.type}</td>
                  <td>{item.weight}</td>
                  <td>{item.date}</td>
                  <td>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {isAddModalOpen && <AddWasteModal onClose={() => setIsAddModalOpen(false)} />}

      <ChatbotWidget />
    </div>
  )
}

export default MyWastePage
