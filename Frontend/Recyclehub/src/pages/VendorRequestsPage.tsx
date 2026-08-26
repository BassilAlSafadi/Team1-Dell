import Navbar from '../components/Navbar'
import ChatbotWidget from '../components/ChatbotWidget'
import './VendorRequestsPage.css'

const requests = [
  {
    id: 1,
    business: 'GreenMart Supermarket',
    materials: ['Plastic', 'Cardboard'],
    quantity: '12 kg',
    location: 'Nasr City, Cairo',
    distance: '1.5 km away',
    fulfillment: 'Pickup',
    posted: '2 hours ago',
  },
  {
    id: 2,
    business: 'Cafe Nour',
    materials: ['Cardboard'],
    quantity: '5 kg',
    location: 'Maadi, Cairo',
    distance: '3.1 km away',
    fulfillment: 'Delivery',
    posted: '5 hours ago',
  },
  {
    id: 3,
    business: 'BuildCo',
    materials: ['Metal'],
    quantity: '20 kg',
    location: 'Heliopolis, Cairo',
    distance: '4.8 km away',
    fulfillment: 'Pickup',
    posted: '1 day ago',
  },
  {
    id: 4,
    business: 'Bright Bakery',
    materials: ['Glass'],
    quantity: '8 kg',
    location: '6th of October',
    distance: '7.6 km away',
    fulfillment: 'Both',
    posted: '1 day ago',
  },
  {
    id: 5,
    business: 'Zamalek Deli',
    materials: ['Paper', 'Plastic'],
    quantity: '6 kg',
    location: 'Zamalek, Cairo',
    distance: '2.9 km away',
    fulfillment: 'Delivery',
    posted: '2 days ago',
  },
  {
    id: 6,
    business: 'Dokki Electronics Shop',
    materials: ['Electronics'],
    quantity: '15 kg',
    location: 'Dokki, Giza',
    distance: '3.4 km away',
    fulfillment: 'Pickup',
    posted: '3 days ago',
  },
]

function VendorRequestsPage() {
  return (
    <div className="page">
      <Navbar variant="vendor" />

      <main className="app-main">
        <div className="page-header">
          <h1>Find Requests</h1>
          <p>Recycling pickup and delivery requests posted by nearby businesses.</p>
        </div>

        <div className="request-grid">
          {requests.map((request) => (
            <article className="request-card" key={request.id}>
              <div className="request-card-top">
                <h2>{request.business}</h2>
                <span className="request-fulfillment">{request.fulfillment}</span>
              </div>

              <p className="request-location">
                {request.location} · {request.distance}
              </p>

              <div className="request-tags">
                {request.materials.map((material) => (
                  <span className="request-tag" key={material}>
                    {material}
                  </span>
                ))}
              </div>

              <p className="request-quantity">Est. quantity: {request.quantity}</p>
              <p className="request-posted">Posted {request.posted}</p>

              <button type="button" className="btn-primary">
                Accept Request
              </button>
            </article>
          ))}
        </div>
      </main>

      <ChatbotWidget />
    </div>
  )
}

export default VendorRequestsPage
