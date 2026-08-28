import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import MyWastePage from './pages/MyWastePage'
import BusinessOffersPage from './pages/BusinessOffersPage'
import FindVendorsPage from './pages/FindVendorsPage'
import TransactionsPage from './pages/TransactionsPage'
import VendorDashboardPage from './pages/VendorDashboardPage'
import VendorRequestsPage from './pages/VendorRequestsPage'
import FindBusinessesPage from './pages/FindBusinessesPage'
import VendorTransactionsPage from './pages/VendorTransactionsPage'
import MessagesPage from './pages/MessagesPage'
import ProtectedRoute from './components/ProtectedRoute'
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated'
import ToastRegion from './components/ToastRegion'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RedirectIfAuthenticated><LandingPage /></RedirectIfAuthenticated>} />
        <Route path="/login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/my-waste" element={<ProtectedRoute><MyWastePage /></ProtectedRoute>} />
        <Route path="/offers" element={<ProtectedRoute><BusinessOffersPage /></ProtectedRoute>} />
        <Route path="/find-vendors" element={<ProtectedRoute><FindVendorsPage /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
        <Route path="/vendor-dashboard" element={<ProtectedRoute><VendorDashboardPage /></ProtectedRoute>} />
        <Route path="/vendor-requests" element={<ProtectedRoute><VendorRequestsPage /></ProtectedRoute>} />
        <Route path="/find-businesses" element={<ProtectedRoute><FindBusinessesPage /></ProtectedRoute>} />
        <Route path="/vendor-transactions" element={<ProtectedRoute><VendorTransactionsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
      </Routes>
      <ToastRegion />
    </>
  )
}

export default App
