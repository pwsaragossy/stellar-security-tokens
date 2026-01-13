import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { CompanyRegister } from './pages/auth/CompanyRegister';
import { CompanyPendingApproval } from './pages/auth/CompanyPendingApproval';
import { RegistrationSuccess } from './pages/auth/RegistrationSuccess';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { DashboardLayout } from './layouts/DashboardLayout';
import { InvestorDashboard } from './pages/investor/Dashboard';
import { Marketplace } from './pages/investor/Marketplace';
import { OfferDetails } from './pages/investor/OfferDetails';
import { Portfolio } from './pages/investor/Portfolio';
import { Transactions } from './pages/investor/Transactions';
import { Settings } from './pages/investor/Settings';
import { Wallet } from './pages/investor/Wallet';

// Admin imports
import { AdminLayout } from './layouts/AdminLayout';
import { AdminLogin } from './pages/admin/Login';
import { AdminDashboard } from './pages/admin/Dashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { FeeConfig } from './pages/admin/FeeConfig';
import { Wallets } from './pages/admin/Wallets';

// Company imports
import { CompanyLayout } from './layouts/CompanyLayout';
import { CompanyDashboard } from './pages/company/Dashboard';
import { Offers } from './pages/company/Offers';
import { CreateOffer } from './pages/company/CreateOffer';
import { OfferDetails as CompanyOfferDetails } from './pages/company/OfferDetails';
import { PayInvestors } from './pages/company/PayInvestors';
import { Reports } from './pages/company/Reports';
import { Settings as CompanySettings } from './pages/company/Settings';
import { Wallet as CompanyWallet } from './pages/company/Wallet';
import { SelectOfferType } from './pages/company/SelectOfferType';
import { IPFSInfo } from './pages/company/IPFSInfo';
import { DefaultCases } from './pages/admin/DefaultCases';
import { AdminSettings } from './pages/admin/Settings';
import { Companies } from './pages/admin/Companies';
import { AdminOffers } from './pages/admin/AdminOffers';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/company/register" element={<CompanyRegister />} />
        <Route path="/company/pending-approval" element={<CompanyPendingApproval />} />
        <Route path="/registration-success" element={<RegistrationSuccess />} />
        <Route path="/investor/verify-email" element={<VerifyEmail />} />

        {/* Investor Dashboard Routes */}
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<InvestorDashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="market" element={<Marketplace />} />
          <Route path="market/:id" element={<OfferDetails />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Company Routes */}
        <Route path="/company" element={<CompanyLayout />}>
          <Route index element={<Navigate to="/company/dashboard" replace />} />
          <Route path="dashboard" element={<CompanyDashboard />} />
          <Route path="offers" element={<Offers />} />
          <Route path="offers/new" element={<SelectOfferType />} />
          <Route path="offers/create" element={<CreateOffer />} />
          <Route path="offers/:id" element={<CompanyOfferDetails />} />
          <Route path="payments/:offerId" element={<PayInvestors />} />
          <Route path="wallet" element={<CompanyWallet />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<CompanySettings />} />
          <Route path="ipfs-info" element={<IPFSInfo />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="companies" element={<Companies />} />
          <Route path="offers" element={<AdminOffers />} />
          <Route path="wallets" element={<Wallets />} />
          <Route path="fees" element={<FeeConfig />} />
          <Route path="defaults" element={<DefaultCases />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}


export default App;

