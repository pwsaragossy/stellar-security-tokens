import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { lazy, Suspense } from 'react';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { CompanyRegister } from './pages/auth/CompanyRegister';
import { CompanyPendingApproval } from './pages/auth/CompanyPendingApproval';
import { RegistrationSuccess } from './pages/auth/RegistrationSuccess';
import { BrowserGate } from './components/BrowserGate';
import { RequireInvestorAuth } from './components/SignInGate';
import { OfferingPreview } from './pages/__OfferingPreview'; // TEMP preview — remove before merge

import { DashboardLayout } from './layouts/DashboardLayout';

import { Marketplace } from './pages/investor/Marketplace';
import { OfferDetails } from './pages/investor/OfferDetails';
import { Portfolio } from './pages/investor/Portfolio';
import { Transactions } from './pages/investor/Transactions';
import { Settings } from './pages/investor/Settings';
import { Wallet } from './pages/investor/Wallet';
import { RampKyc } from './pages/investor/RampKyc';
import { BankAccounts } from './pages/investor/BankAccounts';

// Admin imports
import { AdminLayout } from './layouts/AdminLayout';
import { AdminLogin } from './pages/admin/Login';
import { AdminDashboard } from './pages/admin/Dashboard';
import { UserManagement } from './pages/admin/UserManagement';
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
import { Tokens as CompanyTokens } from './pages/company/Tokens';
import { SelectOfferType } from './pages/company/SelectOfferType';
import { Documents } from './pages/company/Documents';
import { PaymentHistory } from './pages/company/PaymentHistory';
import { IPFSInfo } from './pages/company/IPFSInfo';
import { DefaultCases } from './pages/admin/DefaultCases';

import { Companies } from './pages/admin/Companies';
import { AdminOffers } from './pages/admin/AdminOffers';
import { Contracts } from './pages/admin/Contracts';
import { Distributor } from './pages/admin/Distributor';
import { SecurityEvents } from './pages/admin/SecurityEvents';

import { AssetCompliance } from './pages/admin/AssetCompliance';
import { EmergencyControls } from './pages/admin/EmergencyControls';

import { TokensPage } from './pages/admin/TokensPage';
import { Approvals } from './pages/admin/Approvals';

// Dev-only time control — lazy loaded, tree-shaken in production builds without VITE_DEV_TOOLS
const isDevTools = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';
const DevTimeTool = isDevTools
    ? lazy(() => import('./components/dev/DevTimeTool').then(m => ({ default: m.DevTimeTool })))
    : () => null;

function App() {
  return (
    <>
      {isDevTools && <Suspense><DevTimeTool /></Suspense>}
      <BrowserRouter>
        <Routes>
          <Route path="/__preview/offering" element={<OfferingPreview />} />
          <Route path="/login" element={<BrowserGate><Login /></BrowserGate>} />
          <Route path="/register" element={<BrowserGate><Register /></BrowserGate>} />
          <Route path="/company/register" element={<BrowserGate><CompanyRegister /></BrowserGate>} />
          <Route path="/company/pending-approval" element={<CompanyPendingApproval />} />
          <Route path="/registration-success" element={<RegistrationSuccess />} />


          {/* Investor Dashboard Routes.
              The shell + Marketplace are guest-browseable (no auth); personal
              screens and the invest/detail flow are wrapped in RequireInvestorAuth,
              which renders a SignInGate for guests so the gated screen (and its
              data hooks) never mount. The backend stays fully gated regardless. */}
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/market" replace />} />
            <Route path="dashboard" element={<Navigate to="/market" replace />} />
            <Route path="market" element={<Marketplace />} />
            <Route path="market/:id" element={<RequireInvestorAuth title="Sign in to invest"><OfferDetails /></RequireInvestorAuth>} />
            <Route path="portfolio" element={<RequireInvestorAuth title="Sign in to view your portfolio"><Portfolio /></RequireInvestorAuth>} />
            <Route path="transactions" element={<RequireInvestorAuth title="Sign in to view your transactions"><Transactions /></RequireInvestorAuth>} />
            <Route path="wallet" element={<RequireInvestorAuth title="Sign in to view your wallet"><Wallet /></RequireInvestorAuth>} />
            <Route path="ramp-kyc" element={<RequireInvestorAuth title="Sign in to start KYC"><RampKyc /></RequireInvestorAuth>} />
            <Route path="bank-accounts" element={<RequireInvestorAuth title="Sign in to manage bank accounts"><BankAccounts /></RequireInvestorAuth>} />
            <Route path="settings" element={<RequireInvestorAuth title="Sign in to view settings"><Settings /></RequireInvestorAuth>} />
          </Route>

          {/* Company Routes */}
          <Route path="/company" element={<CompanyLayout />}>
            <Route index element={<Navigate to="/company/dashboard" replace />} />
            <Route path="dashboard" element={<CompanyDashboard />} />
            <Route path="offers" element={<Offers />} />
            <Route path="offers/new" element={<SelectOfferType />} />
            <Route path="offers/create" element={<CreateOffer />} />
            <Route path="offers/:id" element={<CompanyOfferDetails />} />
            <Route path="tokens" element={<CompanyTokens />} />
            <Route path="payments/:offerId" element={<PayInvestors />} />
            <Route path="wallet" element={<CompanyWallet />} />
            <Route path="documents" element={<Documents />} />
            <Route path="payment-history" element={<PaymentHistory />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<CompanySettings />} />
            <Route path="ipfs-info" element={<IPFSInfo />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="companies" element={<Companies />} />
            <Route path="offers" element={<AdminOffers />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="distributor" element={<Distributor />} />
            <Route path="security-events" element={<SecurityEvents />} />
            <Route path="transactions" element={<Navigate to="/admin/approvals" replace />} />
            <Route path="compliance" element={<AssetCompliance />} />
            <Route path="emergency" element={<EmergencyControls />} />

            <Route path="wallets" element={<Wallets />} />
            <Route path="tokens" element={<TokensPage />} />
            <Route path="defaults" element={<DefaultCases />} />

          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        duration={6000}
        toastOptions={{
          style: {
            background: 'hsl(220 25% 12%)',
            border: '1px solid hsl(220 15% 22%)',
            color: 'hsl(220 15% 85%)',
          },
        }}
      />
    </>
  );
}


export default App;

