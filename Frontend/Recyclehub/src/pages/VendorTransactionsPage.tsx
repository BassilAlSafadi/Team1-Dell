import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import './VendorTransactionsPage.css'

const transactions = [
  { id: 1, date: 'Oct 24, 2025', business: 'GreenMart Supermarket', material: 'Plastic (12kg)', amount: '+220 EGP', status: 'Completed' },
  { id: 2, date: 'Oct 22, 2025', business: 'Cafe Nour', material: 'Cardboard (5kg)', amount: '+60 EGP', status: 'Completed' },
  { id: 3, date: 'Oct 19, 2025', business: 'BuildCo', material: 'Metal (20kg)', amount: '+410 EGP', status: 'Pending' },
  { id: 4, date: 'Oct 16, 2025', business: 'Bright Bakery', material: 'Glass (8kg)', amount: '+95 EGP', status: 'Completed' },
  { id: 5, date: 'Oct 10, 2025', business: 'Zamalek Deli', material: 'Paper (6kg)', amount: '+70 EGP', status: 'Completed' },
  { id: 6, date: 'Oct 4, 2025', business: 'GreenMart Supermarket', material: 'Plastic (9kg)', amount: '+165 EGP', status: 'Cancelled' },
  { id: 7, date: 'Sep 28, 2025', business: 'Dokki Electronics Shop', material: 'Electronics (15kg)', amount: '+540 EGP', status: 'Completed' },
]

function VendorTransactionsPage() {
  return (
    <div className="page">
      <Navbar variant="vendor" />

      <main className="app-main">
        <div className="page-header">
          <h1>Transactions</h1>
          <p>Your full history of completed, pending, and cancelled pickups.</p>
        </div>

        <div className="panel vendor-transactions-panel">
          <table className="vendor-transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Business</th>
                <th>Material</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>{tx.business}</td>
                  <td>{tx.material}</td>
                  <td className="amount-positive">{tx.amount}</td>
                  <td>
                    <span className={`status-badge status-${tx.status.toLowerCase()}`}>
                      {tx.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default VendorTransactionsPage
