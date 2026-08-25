import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import './FindVendorsPage.css'

const vendors = [
  {
    id: 1,
    name: 'GreenLoop Recycling',
    materials: ['Plastic', 'Glass', 'Metal'],
    location: 'Nasr City, Cairo',
    distance: '1.2 km away',
    rating: '4.8',
  },
  {
    id: 2,
    name: 'EcoTrade Vendors',
    materials: ['Cardboard', 'Paper'],
    location: 'Maadi, Cairo',
    distance: '3.4 km away',
    rating: '4.6',
  },
  {
    id: 3,
    name: 'MetalWorks Co.',
    materials: ['Metal', 'Electronics'],
    location: 'Heliopolis, Cairo',
    distance: '5.1 km away',
    rating: '4.9',
  },
  {
    id: 4,
    name: 'Cairo Glass Exchange',
    materials: ['Glass'],
    location: '6th of October',
    distance: '8.0 km away',
    rating: '4.5',
  },
  {
    id: 5,
    name: 'PlastiCycle',
    materials: ['Plastic'],
    location: 'Dokki, Giza',
    distance: '2.6 km away',
    rating: '4.7',
  },
  {
    id: 6,
    name: 'PaperTrail Recyclers',
    materials: ['Paper', 'Cardboard'],
    location: 'Zamalek, Cairo',
    distance: '4.3 km away',
    rating: '4.4',
  },
]

function FindVendorsPage() {
  return (
    <div className="page">
      <Navbar />

      <main className="app-main">
        <div className="page-header">
          <h1>Find Vendors</h1>
          <p>Registered local vendors ready to buy your recyclables.</p>
        </div>

        <div className="vendor-grid">
          {vendors.map((vendor) => (
            <article className="vendor-card" key={vendor.id}>
              <div className="vendor-card-top">
                <h2>{vendor.name}</h2>
                <span className="vendor-rating">★ {vendor.rating}</span>
              </div>

              <p className="vendor-location">{vendor.location} · {vendor.distance}</p>

              <div className="vendor-tags">
                {vendor.materials.map((material) => (
                  <span className="vendor-tag" key={material}>
                    {material}
                  </span>
                ))}
              </div>

              <button type="button" className="btn-secondary">
                Contact Vendor
              </button>
            </article>
          ))}
        </div>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default FindVendorsPage
