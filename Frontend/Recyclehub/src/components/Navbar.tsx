import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import './Navbar.css'

type NavbarVariant = 'business' | 'vendor'

type NotificationEntity = {
  type?: string
  id?: string
} | null

type NotificationDto = {
  id: string
  userId: string
  type: string
  title: string
  body: string
  actorId?: string
  entity?: NotificationEntity
  isRead: boolean
  createdAt: string
  readAt?: string
}

const navLinksByVariant: Record<NavbarVariant, { label: string; to: string }[]> = {
  business: [
    { label: 'Home', to: '/dashboard' },
    { label: 'My Waste', to: '/my-waste' },
    { label: 'Find Vendors', to: '/find-vendors' },
    { label: 'Messages', to: '/messages' },
    { label: 'Transactions', to: '/transactions' },
    { label: 'Impact', to: '/dashboard#impact' },
  ],
  vendor: [
    { label: 'Home', to: '/vendor-dashboard' },
    { label: 'Find Requests', to: '/vendor-requests' },
    { label: 'Find Businesses', to: '/find-businesses' },
    { label: 'Messages', to: '/messages' },
    { label: 'Transactions', to: '/vendor-transactions' },
    { label: 'Profile', to: '/vendor-dashboard#profile' },
  ],
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function Navbar({ variant: variantOverride }: { variant?: NavbarVariant }) {
  const navigate = useNavigate()
  const { isAuthenticated, isVendor, user, logout } = useAuth()
  const variant: NavbarVariant = variantOverride ?? (isVendor ? 'vendor' : 'business')

  const [openMenu, setOpenMenu] = useState<'notifications' | 'account' | null>(null)
  const [notifications, setNotifications] = useState<NotificationDto[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const navLinks = navLinksByVariant[variant]
  const homeTo = variant === 'vendor' ? '/vendor-dashboard' : '/dashboard'
  const accountLabel = user?.email ?? ''

  const toggleMenu = (menu: 'notifications' | 'account') => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  const refreshNotifications = async () => {
    try {
      const [list, unread] = await Promise.all([
        api.get<NotificationDto[]>('/api/notifications', { limit: 10 }),
        api.get<{ unreadCount: number }>('/api/notifications/unread-count'),
      ])
      setNotifications(list)
      setUnreadCount(unread.unreadCount)
    } catch {
      // best-effort — leave existing notifications in place on a transient failure
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    refreshNotifications()
    const interval = setInterval(refreshNotifications, 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const handleNotificationClick = async (notification: NotificationDto) => {
    if (notification.isRead) return
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await api.patch(`/api/notifications/${notification.id}/read`)
    } catch {
      // best-effort optimistic update — a background refresh will reconcile
    }
    refreshNotifications()
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="navbar">
      <Link to={homeTo} className="brand">
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

      {isAuthenticated && (
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
              {unreadCount > 0 && <span className="notif-badge" aria-hidden="true" />}
            </button>

            {openMenu === 'notifications' && (
              <div className="dropdown notif-dropdown">
                <p className="dropdown-title">Notifications</p>
                <ul>
                  {notifications.length === 0 ? (
                    <li>
                      <p>No notifications yet.</p>
                    </li>
                  ) : (
                    notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className="notif-item"
                          onClick={() => handleNotificationClick(n)}
                        >
                          <p>{n.isRead ? n.title : <strong>{n.title}</strong>}</p>
                          <span>{timeAgo(n.createdAt)}</span>
                        </button>
                      </li>
                    ))
                  )}
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
              {accountLabel ? accountLabel.charAt(0).toUpperCase() : 'U'}
            </button>

            {openMenu === 'account' && (
              <div className="dropdown account-dropdown">
                <p className="dropdown-title">{accountLabel}</p>
                <button type="button" className="dropdown-link" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
