import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import './VendorDashboardPage.css'

const stats = [
  {
    label: 'Requests Fulfilled',
    value: '86',
    icon: (
      <path
        d="M8 24l10 10L40 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    label: 'Total Earnings',
    value: '4,320 EGP',
    icon: (
      <>
        <rect x="6" y="12" width="36" height="26" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <path d="M6 20h36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="29" r="3" fill="currentColor" />
      </>
    ),
  },
  {
    label: 'Materials Collected',
    value: '312 kg',
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
    label: 'Rating',
    value: '4.8 ★',
    icon: (
      <path
        d="M24 6l5.5 11.2 12.4 1.8-9 8.8 2.1 12.3L24 34l-11 6.1 2.1-12.3-9-8.8 12.4-1.8L24 6Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    ),
  },
]

const recentRequests = [
  { title: 'Pickup request — 12kg plastic from GreenMart Supermarket', date: 'Oct 24, 2025' },
  { title: 'Delivery request — 5kg cardboard from Cafe Nour', date: 'Oct 22, 2025' },
  { title: 'Pickup request — 20kg metal from BuildCo', date: 'Oct 19, 2025' },
  { title: 'Delivery request — 8kg glass from Bright Bakery', date: 'Oct 16, 2025' },
]

const profile = {
  name: 'GreenLoop Recycling',
  category: 'Plastic · Glass · Metal',
  location: 'Nasr City, Cairo',
  memberSince: '2023',
  rating: 4.8,
  reviews: 126,
}

function VendorDashboardPage() {
  return (
    <div className="page vendor-dashboard-page">
      <Navbar variant="vendor" />

      <main className="dashboard-main">
        <section className="welcome">
          <h1>Welcome back, {profile.name}</h1>
          <p>
            Manage incoming requests, track your transactions, and grow your
            recycling business.
          </p>

          <div className="welcome-actions">
            <Link to="/vendor-requests" className="btn-primary">
              Find Requests
            </Link>
            <Link to="/vendor-transactions" className="btn-secondary">
              View Transactions
            </Link>
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
          <div className="panel profile-panel" id="profile">
            <h2>Vendor Profile</h2>

            <div className="profile-card">
              <span className="profile-avatar" aria-hidden="true">
                {profile.name
                  .split(' ')
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join('')}
              </span>
              <div>
                <p className="profile-name">{profile.name}</p>
                <p className="profile-meta">{profile.category}</p>
                <p className="profile-meta">
                  {profile.location} · Member since {profile.memberSince}
                </p>
              </div>
            </div>

            <div className="profile-rating">
              <span className="stars" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={i < Math.round(profile.rating) ? 'star filled' : 'star'}
                  >
                    ★
                  </span>
                ))}
              </span>
              <span className="rating-value">{profile.rating.toFixed(1)}</span>
              <span className="rating-count">({profile.reviews} reviews)</span>
            </div>

            <button type="button" className="btn-secondary">
              Edit Profile
            </button>
          </div>

          <div className="panel activity-panel">
            <h2>Recent Requests</h2>

            <ul className="activity-list">
              {recentRequests.map((item) => (
                <li key={item.title}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <p className="activity-title">{item.title}</p>
                    <p className="activity-date">{item.date}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Link to="/vendor-requests" className="view-all-link">
              View All Requests →
            </Link>
          </div>
        </section>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default VendorDashboardPage
