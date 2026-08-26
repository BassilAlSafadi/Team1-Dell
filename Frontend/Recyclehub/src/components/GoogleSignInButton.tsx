import { useEffect, useId, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
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
}

function GoogleSignInButton({ onError, text = 'continue_with' }: GoogleSignInButtonProps) {
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
        navigate(user.roles.includes('VENDOR') ? '/vendor-dashboard' : '/dashboard')
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

  if (!GOOGLE_CLIENT_ID) return null

  return <div className="google-signin-button" ref={containerRef} id={`google-btn-${elementId}`} />
}

export default GoogleSignInButton
