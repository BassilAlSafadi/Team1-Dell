import { Link } from 'react-router-dom'
import ChatbotWidget from '../components/ChatbotWidget'
import './DashboardPage.css'

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'My Waste', href: '#my-waste' },
  { label: 'Find Vendors', href: '#find-vendors' },
  { label: 'Transactions', href: '#transactions' },
  { label: 'Impact', href: '#impact' },
]

const stats = [
  {
    label: 'Total Waste Recycled',
    value: '42.5 kg',
    icon: (
      <path
        d="M8 38h32M8 34l9-10 7 6 15-16M31 12h8v8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: 'Total Earnings',
    value: '630 EGP',
    icon: (
      <>
        <rect
          x="6"
          y="12"
          width="36"
          height="26"
          rx="4"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M6 20h36"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="32" cy="29" r="3" fill="currentColor" />
      </>
    ),
  },
  {
    label: 'CO2e Saved',
    value: '18.4 kg',
    icon: (
      <path
        d="M24 6c5 4 8 9 8 15a8 8 0 1 1-16 0c0-6 3-11 8-15Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: 'Transactions',
    value: '12',
    icon: (
      <path
        d="M12 8h24v32l-6-4-6 4-6-4-6 4V8Z M18 18h12M18 26h12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

const activity = [
  { title: 'Sold 2kg plastic — 45 EGP', date: 'Oct 24, 2025' },
  { title: 'AI identified Glass Bottle — High Value', date: 'Oct 23, 2025' },
  { title: 'Redeemed 150 EGP to Wallet', date: 'Oct 20, 2025' },
  { title: 'Sold 10kg cardboard — 180 EGP', date: 'Oct 18, 2025' },
  { title: 'AI identified Metal Can', date: 'Oct 15, 2025' },
]

const impact = [
  { month: 'Jan', kg: 12 },
  { month: 'Feb', kg: 18 },
  { month: 'Mar', kg: 10 },
  { month: 'Apr', kg: 22 },
  { month: 'May', kg: 16 },
  { month: 'Jun', kg: 26 },
]

const maxImpact = Math.max(...impact.map((m) => m.kg))

function DashboardPage() {
  return (
    <div className="page dashboard-page">
      <header className="navbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 3c2.5 2 4 4.5 4 7.5a4 4 0 1 1-8 0C8 7.5 9.5 5 12 3Z"
                fill="currentColor"
              />
              <path
                d="M12 12v9M8 21h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-name">RecycleHub</span>
        </div>

        <nav className="nav-links">
          {navLinks.map((link) => (
            <a href={link.href} key={link.label}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="dashboard-nav-actions">
          <button type="button" className="icon-btn" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 20a2.5 2.5 0 0 0 5 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <span className="user-avatar" aria-hidden="true">U</span>

          <Link to="/login" className="logout-link">
            Logout
          </Link>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="welcome">
          <h1>Welcome back, [Business Name]</h1>
          <p>
            Turn your waste into value. Identify recyclables instantly and trade
            with registered local vendors.
          </p>

          <div className="welcome-actions">
            <button type="button" className="btn-primary">
              Scan Waste
            </button>
            <button type="button" className="btn-secondary">
              Add Waste Manually
            </button>
          </div>
        </section>

        <section className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <span className="stat-icon" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {stat.icon}
                </svg>
              </span>
              <div>
                <p className="stat-card-label">{stat.label}</p>
                <p className="stat-card-value">{stat.value}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="dashboard-grid">
          <div className="panel scanner-panel">
            <h2>AI Waste Scanner</h2>

            <div className="dropzone">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect
                  x="6"
                  y="10"
                  width="36"
                  height="28"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="17" cy="20" r="3.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M6 32l10-10 7 7 6-6 13 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="scanner-hint">
              Point your camera or upload an image to identify waste type,
              recyclability score, and estimated market value instantly.
            </p>

            <button type="button" className="btn-secondary">
              Upload Image
            </button>
          </div>

          <div className="panel activity-panel">
            <h2>Recent Activity</h2>

            <ul className="activity-list">
              {activity.map((item) => (
                <li key={item.title}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <p className="activity-title">{item.title}</p>
                    <p className="activity-date">{item.date}</p>
                  </div>
                </li>
              ))}
            </ul>

            <a href="#transactions" className="view-all-link">
              View All Transactions →
            </a>
          </div>
        </section>

        <section className="impact-section" id="impact">
          <h2>Environmental Impact</h2>
          <p className="impact-subtitle">Your monthly CO2e savings (measured in kg)</p>

          <div className="impact-chart">
            {impact.map((m) => (
              <div className="impact-bar-col" key={m.month}>
                <span className="impact-value">{m.kg}kg</span>
                <div
                  className="impact-bar"
                  style={{ height: `${(m.kg / maxImpact) * 100}%` }}
                />
                <span className="impact-month">{m.month}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default DashboardPage
