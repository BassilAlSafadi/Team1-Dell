import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
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

function RegisterPage() {
  const [role, setRole] = useState<Role | null>(null)
  const selectedRole = roles.find((r) => r.id === role) ?? null

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
              <form className="register-form">
                

                {selectedRole.id === 'vendor' ? (
                  <>
                    <label htmlFor="vendorName"> Vendor Name:</label>
                    <input id="vendorName" name="vendorName" type="text" />

                    <label htmlFor="category">Category:</label>
                    <select id="category" name="category" defaultValue="">
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

                    <label htmlFor="taxCertificate">
                      Tax card / certification (for verification):
                    </label>
                    <input
                      id="taxCertificate"
                      name="taxCertificate"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />

                    <label htmlFor="fulfillment">Drop off or delivery:</label>
                    <select id="fulfillment" name="fulfillment" defaultValue="">
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
                    />

                    <label htmlFor="location">Location (address):</label>
                    <input
                      id="location"
                      name="location"
                      type="text"
                      autoComplete="street-address"
                    />

                    <label htmlFor="minimumAmount">
                      Minimum amount required:
                    </label>
                    <input
                      id="minimumAmount"
                      name="minimumAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 10"
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="orgName">Company name:</label>
                    <input id="orgName" name="orgName" type="text" />
                  </>
                )}

                <label htmlFor="email">Email:</label>
                <input id="email" name="email" type="email" autoComplete="email" />

                <label htmlFor="password">Password:</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                />

                <button type="submit" className="register-submit">
                  Create account
                </button>
              </form>

              <p className="signup-hint">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default RegisterPage
