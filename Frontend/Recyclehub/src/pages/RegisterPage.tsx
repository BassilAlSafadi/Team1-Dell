import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, dashboardPathForRoles } from '../lib/auth'
import { api, ApiError } from '../lib/api'
import GoogleSignInButton from '../components/GoogleSignInButton'
import './RegisterPage.css'

type Role = 'vendor' | 'business'

const roles: {
  id: Role
  title: string
  description: string
  icon: ReactElement
  perks: string[]
}[] = [
  {
    id: 'vendor',
    title: 'Vendor',
    description:
      'I collect, sort, or process recyclable materials and want to list my drop-off capacity.',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M8 20v20h32V20"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 12l3-6h30l3 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 12a4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 40V28h8v12"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    perks: [
      'List your drop-off capacity and accepted materials',
      'Get discovered by nearby recyclers',
      'Track incoming material volume over time',
    ],
  },
  {
    id: 'business',
    title: 'Business Owner',
    description:
      'I run a business and want to schedule pickups and track my company’s recycling impact.',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          x="6"
          y="16"
          width="36"
          height="24"
          rx="4"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M17 16v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M6 27h36" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M21 27v4h6v-4"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    perks: [
      'Schedule recurring pickups for your business',
      'Track diverted waste and CO2 saved company-wide',
      'Export compliance-ready recycling reports',
    ],
  },
]

type Step = 'form' | 'onboarding' | 'verify'

type FormState = {
  email: string
  password: string
  vendorName: string
  category: string
  fulfillment: string
  operatingHours: string
  location: string
  minimumAmount: string
  orgName: string
}

const initialFormState: FormState = {
  email: '',
  password: '',
  vendorName: '',
  category: '',
  fulfillment: '',
  operatingHours: '',
  location: '',
  minimumAmount: '',
  orgName: '',
}

function RegisterPage() {
  const navigate = useNavigate()
  const { registerAccount, confirmEmail, login, resendVerification, isAuthenticated, user } = useAuth()

  // A returning, already-signed-in visitor who hits /register goes straight to their account.
  // Captured on mount only, so the in-page Google/verification sub-flows (which sign the user
  // in and then still need an onboarding step) aren't interrupted mid-way.
  const wasAuthenticatedOnMount = useRef(isAuthenticated)
  useEffect(() => {
    if (wasAuthenticatedOnMount.current) {
      navigate(dashboardPathForRoles(user?.roles), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [role, setRole] = useState<Role | null>(null)
  const selectedRole = roles.find((r) => r.id === role) ?? null

  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState<FormState>(initialFormState)
  const [code, setCode] = useState('')

  const [isRegistering, setIsRegistering] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const updateField = (field: keyof FormState) => (
    event: { target: { value: string } },
  ) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const finishAndRedirect = () => {
    navigate(dashboardPathForRoles(role === 'vendor' ? ['VENDOR'] : ['CORPORATE']))
  }

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!role) return
    setError(null)
    setIsRegistering(true)
    try {
      await registerAccount(form.email, form.password, role === 'vendor' ? 'VENDOR' : 'CORPORATE')
      setStep('verify')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsRegistering(false)
    }
  }

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!role) return
    setError(null)
    setIsVerifying(true)
    try {
      await confirmEmail(form.email, code)
      await login(form.email, form.password)

      try {
        if (role === 'vendor') {
          await api.post('/api/vendor-profiles', {
            vendorName: form.vendorName,
            categoryPreference: form.category || undefined,
            fulfillmentMethod: form.fulfillment || undefined,
            operatingHours: form.operatingHours || undefined,
            locationText: form.location || undefined,
            minimumAmount: form.minimumAmount ? Number(form.minimumAmount) : undefined,
          })
        } else {
          await api.post('/api/corporate-profiles', {
            companyName: form.orgName,
          })
        }
      } catch (profileErr) {
        // A 409 (profile already exists) is not fatal — the account is still in a good
        // state, so we proceed to redirect regardless of the profile-creation outcome.
        if (!(profileErr instanceof ApiError && profileErr.status === 409)) {
          throw profileErr
        }
      }

      finishAndRedirect()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  /** After a fresh Google signup: the account exists (role USER) but has no vendor/corporate
   * profile yet, since Google auth never asked for those details — collect them here instead. */
  const handleGoogleSignedUp = () => {
    setError(null)
    setStep('onboarding')
  }

  const handleOnboardingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!role) return
    setError(null)
    setIsOnboarding(true)
    try {
      if (role === 'vendor') {
        await api.post('/api/vendor-profiles', {
          vendorName: form.vendorName,
          categoryPreference: form.category || undefined,
          fulfillmentMethod: form.fulfillment || undefined,
          operatingHours: form.operatingHours || undefined,
          locationText: form.location || undefined,
          minimumAmount: form.minimumAmount ? Number(form.minimumAmount) : undefined,
        })
      } else {
        await api.post('/api/corporate-profiles', {
          companyName: form.orgName,
        })
      }
      finishAndRedirect()
    } catch (err) {
      // A 409 (profile already exists) is not fatal — the account is still in a good state.
      if (err instanceof ApiError && err.status === 409) {
        finishAndRedirect()
        return
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsOnboarding(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setResendMessage(null)
    setIsResending(true)
    try {
      await resendVerification(form.email)
      setResendMessage('A new code has been sent to your email.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  // Shared between the manual signup form and the post-Google onboarding step — both collect
  // the same vendor/business details, just at different points in the flow.
  const renderRoleFields = () =>
    role === 'vendor' ? (
      <>
        <label htmlFor="vendorName"> Vendor Name:</label>
        <input
          id="vendorName"
          name="vendorName"
          type="text"
          value={form.vendorName}
          onChange={updateField('vendorName')}
          required
        />

        <label htmlFor="category">Category:</label>
        <select id="category" name="category" value={form.category} onChange={updateField('category')}>
          <option value="" disabled>
            Select a category
          </option>
          <option value="plastic">Plastic</option>
          <option value="metal">Metal</option>
          <option value="paper">Paper &amp; cardboard</option>
          <option value="glass">Glass</option>
          <option value="electronics">Electronics</option>
          <option value="organic">Organic</option>
          <option value="mixed">Mixed / other</option>
        </select>

        <label htmlFor="taxCertificate">Tax card / certification (for verification):</label>
        <input id="taxCertificate" name="taxCertificate" type="file" accept=".pdf,.jpg,.jpeg,.png" />

        <label htmlFor="fulfillment">Drop off or delivery:</label>
        <select id="fulfillment" name="fulfillment" value={form.fulfillment} onChange={updateField('fulfillment')}>
          <option value="" disabled>
            Select an option
          </option>
          <option value="pickup">Drop off</option>
          <option value="delivery">Delivery</option>
          <option value="both">Both</option>
        </select>

        <label htmlFor="operatingHours">Operating hours:</label>
        <input
          id="operatingHours"
          name="operatingHours"
          type="text"
          placeholder="e.g. Mon–Fri, 9am–5pm"
          value={form.operatingHours}
          onChange={updateField('operatingHours')}
        />

        <label htmlFor="location">Location (address):</label>
        <input
          id="location"
          name="location"
          type="text"
          autoComplete="street-address"
          value={form.location}
          onChange={updateField('location')}
        />

        <label htmlFor="minimumAmount">Minimum amount required:</label>
        <input
          id="minimumAmount"
          name="minimumAmount"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 10"
          value={form.minimumAmount}
          onChange={updateField('minimumAmount')}
        />
      </>
    ) : (
      <>
        <label htmlFor="orgName">Company name:</label>
        <input
          id="orgName"
          name="orgName"
          type="text"
          value={form.orgName}
          onChange={updateField('orgName')}
          required
        />
      </>
    )

  return (
    <div className="register-page">
      <header className="register-header">
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

      <main className="register-main">
        {selectedRole === null ? (
          <div className="role-picker">
            <div className="section-head">
              <span className="eyebrow">Create your account</span>
              <h1>How will you use RecycleHub?</h1>
              <p>
                Choose the option that best describes you — you can always
                change this later.
              </p>
            </div>

            <div className="role-cards">
              {roles.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="role-card"
                  onClick={() => setRole(r.id)}
                >
                  <span className="role-icon">{r.icon}</span>
                  <h2>{r.title}</h2>
                  <p>{r.description}</p>
                  <span className="role-cta">Continue as {r.title} &rarr;</span>
                </button>
              ))}
            </div>

            <p className="signup-hint">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          </div>
        ) : (
          <div className="register-card">
            <div className="register-intro">
              <button
                type="button"
                className="change-role"
                onClick={() => setRole(null)}
              >
                &larr; Change account type
              </button>
              <h1>Register as a {selectedRole.title}</h1>
              <ul>
                {selectedRole.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
            </div>

            <div className="register-form-panel">
              {step === 'form' ? (
                <>
                  <form className="register-form" onSubmit={handleRegisterSubmit}>
                    {renderRoleFields()}

                    <label htmlFor="email">Email:</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={updateField('email')}
                      required
                    />

                    <label htmlFor="password">Password (min. 12 characters):</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={updateField('password')}
                      required
                      minLength={12}
                    />

                    {error && (
                      <p className="register-error" role="alert">
                        {error}
                      </p>
                    )}

                    <button type="submit" className="register-submit" disabled={isRegistering}>
                      {isRegistering ? 'Creating account…' : 'Create account'}
                    </button>
                  </form>

                  <div className="auth-divider">
                    <span>or</span>
                  </div>

                  <GoogleSignInButton text="signup_with" onError={setError} onSuccess={handleGoogleSignedUp} />

                  <p className="signup-hint">
                    Already have an account? <Link to="/login">Log in</Link>
                  </p>
                </>
              ) : step === 'onboarding' ? (
                <>
                  <form className="register-form" onSubmit={handleOnboardingSubmit}>
                    <p className="verify-hint">
                      You&apos;re signed in with Google — just a few details to finish setting up
                      your {selectedRole.title.toLowerCase()} account.
                    </p>

                    {renderRoleFields()}

                    {error && (
                      <p className="register-error" role="alert">
                        {error}
                      </p>
                    )}

                    <button type="submit" className="register-submit" disabled={isOnboarding}>
                      {isOnboarding ? 'Saving…' : 'Finish setup'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <form className="register-form" onSubmit={handleVerifySubmit}>
                    <p className="verify-hint">
                      We&apos;ve sent a 6-digit verification code to <strong>{form.email}</strong>.
                      Enter it below to finish creating your account.
                    </p>

                    <label htmlFor="code">Verification code:</label>
                    <input
                      id="code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                    />

                    {error && (
                      <p className="register-error" role="alert">
                        {error}
                      </p>
                    )}
                    {resendMessage && <p className="verify-hint">{resendMessage}</p>}

                    <button type="submit" className="register-submit" disabled={isVerifying}>
                      {isVerifying ? 'Verifying…' : 'Verify & continue'}
                    </button>

                    <button
                      type="button"
                      className="change-role"
                      onClick={handleResend}
                      disabled={isResending}
                    >
                      {isResending ? 'Resending…' : 'Resend code'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default RegisterPage
