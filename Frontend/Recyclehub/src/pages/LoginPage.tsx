import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './LoginPage.css'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const user = await login(email, password)
      navigate(user.roles.includes('VENDOR') ? '/vendor-dashboard' : '/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <Link to="/" className="brand">
          <span className="logo" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="12" cy="8" r="4" fill="currentColor" />
                <path
                  d="M4 20c0-4 3.5-6 8-6s8 2 8 6"
                  fill="currentColor"
                />
              </svg>
            </span>

            <form className="login-form" onSubmit={handleSubmit}>
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

              <a href="#forgot-password" className="forgot-password">
                forgot password?
              </a>

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
          </div>
        </div>
      </main>
    </div>
  )
}

export default LoginPage
