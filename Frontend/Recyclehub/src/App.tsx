import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import MyWastePage from './pages/MyWastePage'
import FindVendorsPage from './pages/FindVendorsPage'
import TransactionsPage from './pages/TransactionsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/my-waste" element={<MyWastePage />} />
      <Route path="/find-vendors" element={<FindVendorsPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
    </Routes>
  )
}

export default App
