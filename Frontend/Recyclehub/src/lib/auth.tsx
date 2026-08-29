import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, request, setAccessToken, setRefreshToken, setAuthHandlers } from './api'

const STORAGE_KEY = 'recyclehub.auth'

type StoredTokens = {
  accessToken: string
  refreshToken: string
}

type JwtPayload = {
  sub: string
  email: string
  roles?: string[]
}

type AuthUser = {
  userId: string
  email: string
  roles: string[]
}

type TokenResponse = {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
}

type UserResponse = {
  userId: string
  email: string
  emailVerified: boolean
  status: string
  roles: string[]
}

/** Decodes a JWT payload without verifying the signature — the gateway/backends are the
 * actual trust boundary; this is purely for reading the already-trusted claims client-side. */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

function userFromToken(accessToken: string): AuthUser | null {
  const payload = decodeJwt(accessToken)
  if (!payload) return null
  return { userId: payload.sub, email: payload.email, roles: payload.roles ?? [] }
}

function loadStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

function storeTokens(tokens: StoredTokens | null) {
  if (tokens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export type AccountType = 'VENDOR' | 'CORPORATE'

/** The landing page for a signed-in user, by role. Centralised so the login form, the Google
 * button, the post-verification redirect and the "already signed in" guards all agree. */
export function dashboardPathForRoles(roles: string[] | undefined): string {
  return roles?.includes('VENDOR') ? '/vendor-dashboard' : '/dashboard'
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  isVendor: boolean
  isCorporate: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  loginWithGoogle: (idToken: string) => Promise<AuthUser>
  registerAccount: (email: string, password: string, accountType: AccountType) => Promise<UserResponse>
  confirmEmail: (email: string, code: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  logout: () => Promise<void>
  /** Permanently deletes the signed-in account. `confirmation` must be the account email,
   * retyped by the user. Clears the local session on success. */
  deleteAccount: (confirmation: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<StoredTokens | null>(() => loadStoredTokens())
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = loadStoredTokens()
    return stored ? userFromToken(stored.accessToken) : null
  })

  useEffect(() => {
    setAccessToken(tokens?.accessToken ?? null)
    setRefreshToken(tokens?.refreshToken ?? null)
  }, [tokens])

  // Registered once — api.ts calls these on a silent refresh (keeps localStorage/state in
  // sync without a re-render-driven round trip) and when refresh itself fails (session over).
  useEffect(() => {
    setAuthHandlers({
      onTokensRefreshed: (next) => {
        storeTokens(next)
        setTokens(next)
      },
      onAuthExpired: () => {
        storeTokens(null)
        setTokens(null)
        setUser(null)
      },
    })
  }, [])

  const applyTokens = (next: TokenResponse) => {
    const stored: StoredTokens = { accessToken: next.accessToken, refreshToken: next.refreshToken }
    storeTokens(stored)
    setTokens(stored)
    const nextUser = userFromToken(next.accessToken)
    setUser(nextUser)
    return nextUser
  }

  const login = async (email: string, password: string) => {
    const tokenResponse = await api.post<TokenResponse>('/api/auth/login', { email, password })
    const nextUser = applyTokens(tokenResponse)
    if (!nextUser) throw new Error('Could not read account details from the issued token.')
    return nextUser
  }

  const loginWithGoogle = async (idToken: string) => {
    const tokenResponse = await api.post<TokenResponse>('/api/auth/google', { idToken })
    const nextUser = applyTokens(tokenResponse)
    if (!nextUser) throw new Error('Could not read account details from the issued token.')
    return nextUser
  }

  const registerAccount = (email: string, password: string, accountType: AccountType) =>
    api.post<UserResponse>('/api/auth/register', { email, password, accountType })

  const confirmEmail = (email: string, code: string) =>
    api.post<void>('/api/auth/email-verification/confirm', { email, code })

  const resendVerification = (email: string) => api.post<void>('/api/auth/email-verification/send', { email })

  const logout = async () => {
    const refreshToken = tokens?.refreshToken
    storeTokens(null)
    setTokens(null)
    setUser(null)
    if (refreshToken) {
      try {
        await api.post('/api/auth/logout', { refreshToken })
      } catch {
        // best-effort — the local session is already cleared either way
      }
    }
  }

  const deleteAccount = async (confirmation: string) => {
    await request<void>('/api/auth/me', { method: 'DELETE', body: { confirmation } })
    storeTokens(null)
    setTokens(null)
    setUser(null)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isVendor: user?.roles.includes('VENDOR') ?? false,
      isCorporate: user?.roles.includes('CORPORATE') ?? false,
      login,
      loginWithGoogle,
      registerAccount,
      confirmEmail,
      resendVerification,
      logout,
      deleteAccount,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, tokens],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
