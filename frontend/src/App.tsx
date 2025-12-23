import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { RegistrationSuccess } from './pages/auth/RegistrationSuccess';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { DashboardLayout } from './layouts/DashboardLayout';
import { InvestorDashboard } from './pages/investor/Dashboard';
import { Marketplace } from './pages/investor/Marketplace';
import { OfferDetails } from './pages/investor/OfferDetails';
import { Portfolio } from './pages/investor/Portfolio';
import { Transactions } from './pages/investor/Transactions';
import { Settings } from './pages/investor/Settings';

// Admin imports
import { AdminLayout } from './layouts/AdminLayout';
import { AdminLogin } from './pages/admin/Login';
import { AdminDashboard } from './pages/admin/Dashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { FeeConfig } from './pages/admin/FeeConfig';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/registration-success" element={<RegistrationSuccess />} />
        <Route path="/investor/verify-email" element={<VerifyEmail />} />

        {/* Protected Dashboard Routes */}
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<InvestorDashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="market" element={<Marketplace />} />
          <Route path="market/:id" element={<OfferDetails />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="fees" element={<FeeConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}


export default App;
