import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import './Navbar.css'

const navLinks = [
  { label: 'Home', to: '/dashboard' },
  { label: 'My Waste', to: '/my-waste' },
  { label: 'Find Vendors', to: '/find-vendors' },
  { label: 'Transactions', to: '/transactions' },
  { label: 'Impact', to: '/dashboard#impact' },
]

const notifications = [
  { id: 1, text: 'Your plastic sale (45 EGP) was confirmed.', time: '2h ago' },
  { id: 2, text: 'GreenLoop Vendor accepted your offer.', time: '1d ago' },
  { id: 3, text: 'AI scan complete: Glass Bottle, high value.', time: '2d ago' },
]

function Navbar() {
  const [openMenu, setOpenMenu] = useState<'notifications' | 'account' | null>(null)

  const toggleMenu = (menu: 'notifications' | 'account') => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  return (
    <header className="navbar">
      <Link to="/dashboard" className="brand">
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
      </Link>

      <nav className="nav-links">
        {navLinks.map((link) =>
          link.to.includes('#') ? (
            <Link to={link.to} key={link.label}>
              {link.label}
            </Link>
          ) : (
            <NavLink
              to={link.to}
              key={link.label}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {link.label}
            </NavLink>
          ),
        )}
      </nav>

      <div className="nav-actions-group">
        <div className="menu-anchor">
          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
            onClick={() => toggleMenu('notifications')}
          >
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
            <span className="notif-badge" aria-hidden="true" />
          </button>

          {openMenu === 'notifications' && (
            <div className="dropdown notif-dropdown">
              <p className="dropdown-title">Notifications</p>
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <p>{n.text}</p>
                    <span>{n.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="menu-anchor">
          <button
            type="button"
            className="user-avatar"
            aria-label="Account menu"
            onClick={() => toggleMenu('account')}
          >
            U
          </button>

          {openMenu === 'account' && (
            <div className="dropdown account-dropdown">
              <p className="dropdown-title">[Business Name]</p>
              <Link to="/login" className="dropdown-link">
                Logout
              </Link>
            </div>
          )}
        </div>
      </div>

      {openMenu && (
        <button
          type="button"
          className="dropdown-backdrop"
          aria-label="Close menu"
          onClick={() => setOpenMenu(null)}
        />
      )}
    </header>
  )
}

export default Navbar
