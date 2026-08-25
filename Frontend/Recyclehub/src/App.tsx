import './App.css'

function App() {
  return (
    <div className="page">
      <header className="navbar">
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

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#how-it-works">How it works</a>
          <a href="#locations">Locations</a>
          <a href="#about">About</a>
        </nav>

        <div className="nav-actions">
          <button type="button" className="get-started-btn">
            Register
          </button>
          <button type="button" className="get-started-btn">
            Log In
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
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
      </main>
    </div>
  );
}

export default App
