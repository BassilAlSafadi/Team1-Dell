import { Link } from 'react-router-dom'
import heroImage from '../assets/hero-team.jpg'
import './LandingPage.css'

const steps = [
  {
    number: '01',
    title: 'Log an item',
    text: 'Tell us what you’re tossing — the material, quantity, and condition.',
  },
  {
    number: '02',
    title: 'Get matched to a center',
    text: 'We point you to the nearest drop-off location that accepts it.',
  },
  {
    number: '03',
    title: 'Watch your impact grow',
    text: 'See your diverted waste and saved CO2 add up over time.',
  },
]

const stats = [
  { value: '48,200kg', label: 'Waste diverted' },
  { value: '15,600', label: 'Items recycled' },
  { value: '320+', label: 'Partner centers' },
  { value: '9,000+', label: 'Active recyclers' },
]

function LandingPage() {
  return (
    <div className="page">
      <header className="marketing-header">
        <div className="brand">
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
        </div>

        <nav className="marketing-nav-links">
          <a href="#home">Home</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <div className="marketing-nav-actions">
          <Link to="/login" className="marketing-btn marketing-btn-ghost">
            Log In
          </Link>
          <Link to="/register" className="marketing-btn marketing-btn-solid">
            Register
          </Link>
        </div>
      </header>

      <main id="home">
        <section
          className="hero"
          style={{ backgroundImage: `var(--hero-scrim), url(${heroImage})` }}
        >
          <h1>Recycle smarter, live greener</h1>
          <p className="hero-text">
            RecycleHub helps you log what you recycle, discover drop-off points
            near you, and see the real impact of every item you keep out of the
            landfill.
          </p>

          <div className="feature-cards">
            <article className="feature-card">
              <div className="feature-content">
                <h2>Track your impact</h2>
                <p>
                  Log every item you recycle and watch your personal impact grow
                  — total weight diverted, CO2 saved, and more.
                </p>
              </div>
              <div className="feature-image">
                <svg
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M8 38h32"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 34l9-10 7 6 15-16"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M31 12h8v8"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </article>

            <article className="feature-card">
              <div className="feature-content">
                <h2>Find nearby centers</h2>
                <p>
                  Locate recycling centers and drop-off points near you,
                  complete with accepted materials and opening hours.
                </p>
              </div>
              <div className="feature-image">
                <svg
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M24 44s14-12.5 14-23a14 14 0 1 0-28 0c0 10.5 14 23 14 23Z"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="24"
                    cy="21"
                    r="5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </article>
          </div>
        </section>

        <section className="how-it-works" id="how-it-works">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three simple steps to recycle smarter</h2>
          </div>

          <div className="steps">
            {steps.map((step) => (
              <div className="step" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="stats-band">
        <div className="stats-inner">
          {stats.map((stat) => (
            <div className="stat" key={stat.label}>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="brand">
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
            </div>
            <p className="footer-slogan">Monetize your Waste</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; 2026 RecycleHub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
