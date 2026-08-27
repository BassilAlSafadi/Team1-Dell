import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, dashboardPathForRoles } from '../lib/auth'

/** Wraps the public auth screens (landing, login, register). A visitor who already has a
 * valid session — restored from localStorage on load, or still live from an earlier visit —
 * is sent straight to their dashboard instead of being shown a sign-in form again. They only
 * see these screens after an explicit logout. */
export default function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated) return <Navigate to={dashboardPathForRoles(user?.roles)} replace />
  return <>{children}</>
}
