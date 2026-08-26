import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import './TransactionsPage.css'

const transactions = [
  { id: 1, date: 'Oct 24, 2025', description: 'Sold 2kg plastic', type: 'Sale', amount: '+45 EGP', status: 'Completed' },
  { id: 2, date: 'Oct 23, 2025', description: 'AI identified Glass Bottle', type: 'Scan', amount: '—', status: 'Identified' },
  { id: 3, date: 'Oct 20, 2025', description: 'Redeemed to Wallet', type: 'Redeem', amount: '-150 EGP', status: 'Completed' },
  { id: 4, date: 'Oct 18, 2025', description: 'Sold 10kg cardboard', type: 'Sale', amount: '+180 EGP', status: 'Completed' },
  { id: 5, date: 'Oct 15, 2025', description: 'AI identified Metal Can', type: 'Scan', amount: '—', status: 'Identified' },
  { id: 6, date: 'Oct 10, 2025', description: 'Logged 5kg paper', type: 'Manual', amount: '—', status: 'Pending' },
  { id: 7, date: 'Oct 6, 2025', description: 'Sold 4.2kg plastic', type: 'Sale', amount: '+75 EGP', status: 'Completed' },
  { id: 8, date: 'Sep 30, 2025', description: 'Redeemed to Wallet', type: 'Redeem', amount: '-200 EGP', status: 'Completed' },
]

function TransactionsPage() {
  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Transactions</h1>
          <p>Your full sales, redemptions, and scan history.</p>
        </div>

        <div className="panel transactions-table-panel">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>{tx.description}</td>
                  <td>{tx.type}</td>
                  <td className={tx.amount.startsWith('-') ? 'amount-negative' : 'amount-positive'}>
                    {tx.amount}
                  </td>
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

export default TransactionsPage
