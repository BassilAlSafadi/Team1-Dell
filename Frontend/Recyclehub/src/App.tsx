import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import MyWastePage from './pages/MyWastePage'
import FindVendorsPage from './pages/FindVendorsPage'
import TransactionsPage from './pages/TransactionsPage'
import VendorDashboardPage from './pages/VendorDashboardPage'
import VendorRequestsPage from './pages/VendorRequestsPage'
import VendorTransactionsPage from './pages/VendorTransactionsPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/my-waste" element={<ProtectedRoute><MyWastePage /></ProtectedRoute>} />
      <Route path="/find-vendors" element={<ProtectedRoute><FindVendorsPage /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
      <Route path="/vendor-dashboard" element={<ProtectedRoute><VendorDashboardPage /></ProtectedRoute>} />
      <Route path="/vendor-requests" element={<ProtectedRoute><VendorRequestsPage /></ProtectedRoute>} />
      <Route path="/vendor-transactions" element={<ProtectedRoute><VendorTransactionsPage /></ProtectedRoute>} />
    </Routes>
  )
}

export default App
