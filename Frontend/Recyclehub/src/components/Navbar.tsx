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
    { label: 'Offers', to: '/offers' },
    { label: 'Find Vendors', to: '/find-vendors' },
    { label: 'Messages', to: '/messages' },
    { label: 'Transactions', to: '/transactions' },
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

type NotificationDestination = { path: string; state?: Record<string, unknown> }

type ConversationSummary = { _id: string; listing_id: string | null }

/** Where a notification should take you, based on what it's about — not just marking
 * it read. Routed primarily off `notification.type` (the fixed NotificationType enum —
 * see services/notification-service/internal/models/notification.go) rather than
 * `entity.type`, because `entity.type` isn't reliably the thing you'd expect: real
 * deal-status notifications do set it to "deal" (DealService), but the demo seed data
 * (deploy/seed/seed_data.py) stamps every notification's entity as
 * {type: "listing", id: <listingId>} regardless of what the notification is actually
 * about, since that's the one id every seeded notification type has on hand. Only use
 * entity.id for a highlight when its type actually matches what the destination page
 * expects — otherwise land on the page without one rather than highlight the wrong row. */
function routeForNotification(notification: NotificationDto, isVendor: boolean): NotificationDestination | null {
  const entity = notification.entity

  switch (notification.type) {
    case 'NEW_OFFER':
      // Recipient is the business whose listing got the offer.
      return isVendor
        ? null
        : { path: '/offers', state: entity?.type === 'offer' ? { highlightOfferId: entity.id } : undefined }

    case 'OFFER_ACCEPTED':
      // Recipient is the vendor who sent it — there's no "my sent offers" list to land
      // on, so the closest useful place is their dashboard, which surfaces it under
      // Recent Requests.
      return isVendor ? { path: '/vendor-dashboard' } : null

    case 'DEAL_COMPLETED':
    case 'DEAL_STATUS_CHANGED':
      return {
        path: isVendor ? '/vendor-transactions' : '/transactions',
        state: entity?.type === 'deal' ? { highlightDealId: entity.id } : undefined,
      }

    case 'NEW_REVIEW':
      // Recipient is the vendor being reviewed — their profile/rating lives on their
      // own dashboard, there's no standalone review page.
      return isVendor ? { path: '/vendor-dashboard' } : null

    default:
      return null
  }
}

/** NEW_MESSAGE notifications carry the listing the message is about, not the
 * conversation id itself — resolve it by matching listing_id against the caller's
 * conversations so the click actually opens the right thread, the way FindVendorsPage /
 * VendorRequestsPage already do when starting a new conversation. Falls back to the
 * Messages list (no thread pre-selected) if the listing can't be matched to one. */
async function resolveMessageDestination(notification: NotificationDto): Promise<NotificationDestination> {
  const listingId = notification.entity?.type === 'listing' ? notification.entity.id : undefined
  const conversationId = notification.entity?.type === 'conversation' ? notification.entity.id : undefined

  if (conversationId) return { path: '/messages', state: { conversationId } }
  if (!listingId) return { path: '/messages' }

  try {
    const conversations = await api.get<ConversationSummary[]>('/api/conversations')
    const match = conversations.find((c) => c.listing_id === listingId)
    return { path: '/messages', state: match ? { conversationId: match._id } : undefined }
  } catch {
    return { path: '/messages' }
  }
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

  const [openMenu, setOpenMenu] = useState<'notifications' | 'account' | 'mobile-nav' | null>(null)
  const [notifications, setNotifications] = useState<NotificationDto[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const navLinks = navLinksByVariant[variant]
  const homeTo = variant === 'vendor' ? '/vendor-dashboard' : '/dashboard'
  const accountLabel = user?.email ?? ''

  const toggleMenu = (menu: 'notifications' | 'account' | 'mobile-nav') => {
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

  // Escape closes whichever menu (notifications, account, or the mobile nav panel) is open.
  useEffect(() => {
    if (!openMenu) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openMenu])

  const handleNotificationClick = async (notification: NotificationDto) => {
    setOpenMenu(null)

    if (!notification.isRead) {
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

    // Reading it is only half the job — take them to whatever it's actually about.
    // Works for an already-read notification too, so re-clicking one still gets you there.
    const destination =
      notification.type === 'NEW_MESSAGE'
        ? await resolveMessageDestination(notification)
        : routeForNotification(notification, isVendor)
    if (destination) navigate(destination.path, { state: destination.state })
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

      <div className="nav-actions-group">
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-label={openMenu === 'mobile-nav' ? 'Close menu' : 'Open menu'}
          aria-expanded={openMenu === 'mobile-nav'}
          aria-controls="mobile-nav-panel"
          onClick={() => toggleMenu('mobile-nav')}
        >
          {openMenu === 'mobile-nav' ? (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {isAuthenticated && (
          <>
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
          </>
        )}
      </div>

      {openMenu === 'mobile-nav' && (
        <nav className="mobile-nav-panel" id="mobile-nav-panel" aria-label="Primary">
          {navLinks.map((link) =>
            link.to.includes('#') ? (
              <Link to={link.to} key={link.label} onClick={() => setOpenMenu(null)}>
                {link.label}
              </Link>
            ) : (
              <NavLink
                to={link.to}
                key={link.label}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
                onClick={() => setOpenMenu(null)}
              >
                {link.label}
              </NavLink>
            ),
          )}
        </nav>
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
