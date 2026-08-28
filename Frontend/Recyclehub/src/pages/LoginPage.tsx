import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, dashboardPathForRoles } from '../lib/auth'
import { ApiError } from '../lib/api'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './LoginPage.css'

type Step = 'credentials' | 'verify'

/** auth-service returns 403 with this exact message when the account exists and the password
 * is right but the email was never confirmed — the one case where we route into verification
 * rather than just showing the error. */
const NEEDS_VERIFICATION = 'Please verify your email before logging in.'

function LoginPage() {
  const navigate = useNavigate()
  const { login, confirmEmail, resendVerification } = useAuth()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsSubmitting(true)
    try {
      const user = await login(email, password)
      navigate(dashboardPathForRoles(user.roles))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message === NEEDS_VERIFICATION) {
        // Move to the code step and send a fresh code — the one from registration may have
        // expired (15-minute TTL), and this is likely the first time they've seen this screen.
        setStep('verify')
        setCode('')
        try {
          await resendVerification(email)
          setNotice(`We sent a 6-digit code to ${email}. Enter it below to finish signing in.`)
        } catch {
          setNotice(`Enter the 6-digit code we emailed to ${email}.`)
        }
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await confirmEmail(email, code.trim())
      const user = await login(email, password)
      navigate(dashboardPathForRoles(user.roles))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setNotice(null)
    setIsResending(true)
    try {
      await resendVerification(email)
      setNotice('A new code is on its way. It can take a minute to arrive.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  const backToCredentials = () => {
    setStep('credentials')
    setError(null)
    setNotice(null)
    setCode('')
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <Link to="/" className="brand">
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
      </header>

      <main className="login-main">
        <div className="login-card">
          <div className="login-intro">
            <h1>
              Welcome
              <br />
              back
            </h1>
            <ul>
              <li>Log every item you recycle in seconds</li>
              <li>Track your personal environmental impact</li>
              <li>Find drop-off points near you</li>
            </ul>
          </div>

          <div className="login-form-panel">
            <span className="avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" fill="currentColor" />
                <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" fill="currentColor" />
              </svg>
            </span>

            {step === 'credentials' ? (
              <>
                <form className="login-form" onSubmit={handleCredentialsSubmit}>
                  <label htmlFor="email">Email:</label>
                  <input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <label htmlFor="password">Password:</label>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  {error && (
                    <p className="login-error" role="alert">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="login-submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Logging in…' : 'Log In'}
                  </button>
                </form>

                <div className="auth-divider">
                  <span>or</span>
                </div>

                <GoogleSignInButton text="signin_with" onError={setError} />

                <p className="signup-hint">
                  Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
              </>
            ) : (
              <form className="login-form" onSubmit={handleVerifySubmit}>
                <button type="button" className="link-back" onClick={backToCredentials}>
                  &larr; Back to sign in
                </button>

                <h2 className="verify-title">Verify your email</h2>
                {notice && <p className="verify-hint">{notice}</p>}

                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  name="code"
                  className="verify-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />

                {error && (
                  <p className="login-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="login-submit"
                  disabled={isSubmitting || code.length < 6}
                >
                  {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
                </button>

                <button
                  type="button"
                  className="link-resend"
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? 'Resending…' : "Didn't get it? Resend code"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default LoginPage
