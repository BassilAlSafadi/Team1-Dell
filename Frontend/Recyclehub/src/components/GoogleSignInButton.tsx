import { useEffect, useId, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, dashboardPathForRoles } from '../lib/auth'
import { ApiError } from '../lib/api'
import './GoogleSignInButton.css'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GSI_SCRIPT_SELECTOR = 'script[src*="accounts.google.com/gsi/client"]'

type GoogleSignInButtonProps = {
  /** Reported via this callback instead of thrown, since rendering happens outside any form submit handler. */
  onError: (message: string) => void
  text?: 'signin_with' | 'signup_with' | 'continue_with'
  /** Called with the authenticated user instead of the default navigate-by-role redirect —
   * use this when the caller needs to route somewhere other than the dashboard (e.g. into an
   * onboarding step to collect vendor/business details a fresh Google signup doesn't have yet). */
  onSuccess?: (user: { userId: string; email: string; roles: string[] }) => void
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.87 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3.02-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.96l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

function GoogleSignInButton({ onError, text = 'continue_with', onSuccess }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { loginWithGoogle } = useAuth()
  const elementId = useId()

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false

    const handleCredentialResponse = async (response: { credential: string }) => {
      try {
        const user = await loginWithGoogle(response.credential)
        if (onSuccess) {
          onSuccess(user)
        } else {
          navigate(dashboardPathForRoles(user.roles))
        }
      } catch (err) {
        onError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.')
      }
    }

    const render = () => {
      if (cancelled || !window.google || !containerRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      })
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text,
        width: 320,
      })
    }

    if (window.google) {
      render()
      return
    }

    const script = document.querySelector<HTMLScriptElement>(GSI_SCRIPT_SELECTOR)
    script?.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  if (!GOOGLE_CLIENT_ID) {
    const label =
      text === 'signup_with' ? 'Sign up with Google' : text === 'signin_with' ? 'Sign in with Google' : 'Continue with Google'
    return (
      <div className="google-signin-button google-signin-button--unconfigured">
        <button type="button" disabled title="Set VITE_GOOGLE_CLIENT_ID in Frontend/Recyclehub/.env to enable this">
          <GoogleGlyph />
          {label}
        </button>
        <span className="google-signin-hint">Google sign-in isn&apos;t configured yet</span>
      </div>
    )
  }

  return <div className="google-signin-button" ref={containerRef} id={`google-btn-${elementId}`} />
}

export default GoogleSignInButton
