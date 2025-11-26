import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { WalletProvider } from './contexts/WalletContext';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { PublicRoute } from './components/auth/PublicRoute';

// Landing page
import { Landing } from './pages/Landing';

// Dev Login (unified)
import { DevLogin } from './pages/DevLogin';

// Investor Portal
import { InvestorRegister } from './pages/investor/Register';
import { InvestorVerifyEmail } from './pages/investor/VerifyEmail';
import { InvestorDashboard } from './pages/investor/Dashboard';
import { InvestorPortfolio } from './pages/investor/Portfolio';
import { InvestorOffers } from './pages/investor/Offers';
import { InvestorOfferDetail } from './pages/investor/OfferDetail';
import { InvestorInvest } from './pages/investor/Invest';
import { InvestorInvestmentStatus } from './pages/investor/InvestmentStatus';
import { InvestorInvestments } from './pages/investor/Investments';
import { InvestorBalance } from './pages/investor/Balance';
import { InvestorPayments } from './pages/investor/Payments';
import { InvestorProfile } from './pages/investor/Profile';

// Company Portal
import { CompanyRegister } from './pages/company/Register';
import { CompanyRegisterUser } from './pages/company/RegisterUser';
import { CompanyVerifyEmail } from './pages/company/VerifyEmail';
import { CompanyDashboard } from './pages/company/Dashboard';
import { CompanyProfile } from './pages/company/Profile';
import { CompanyOffersList } from './pages/company/offers/List';
import { CompanyOfferCreate } from './pages/company/offers/Create';
import { CompanyOfferDetail } from './pages/company/offers/Detail';
import { CompanyOfferEdit } from './pages/company/offers/Edit';
import { CompanyUsers } from './pages/company/Users';

// Admin Portal
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminCompaniesList } from './pages/admin/companies/List';
import { AdminCompanyDetail } from './pages/admin/companies/Detail';
import { AdminOffersList } from './pages/admin/offers/List';
import { AdminOfferReview } from './pages/admin/offers/Review';
import { AdminInvestmentsMetrics } from './pages/admin/investments/Metrics';
import { AdminInvestmentsStatistics } from './pages/admin/investments/Statistics';
import { AdminInvestmentsPending } from './pages/admin/investments/Pending';
import { AdminInvestorsList } from './pages/admin/investors/List';
import { AdminInvestorDetail } from './pages/admin/investors/Detail';
import { AdminTokensList } from './pages/admin/tokens/List';
import { AdminPaymentsProcess } from './pages/admin/payments/Process';
import { AdminPaymentsHistory } from './pages/admin/payments/History';
import { AdminPaymentsStatistics } from './pages/admin/payments/Statistics';
import { AdminAdminsList } from './pages/admin/admins/List';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <WalletProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route
            path="/dev/login"
            element={
              <PublicRoute>
                <DevLogin />
              </PublicRoute>
            }
          />

          {/* Investor Portal Routes */}
          <Route
            path="/investor/login"
            element={
              <PublicRoute>
                <DevLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/investor/register"
            element={
              <PublicRoute>
                <InvestorRegister />
              </PublicRoute>
            }
          />
          <Route
            path="/investor/verify-email"
            element={
              <PublicRoute>
                <InvestorVerifyEmail />
              </PublicRoute>
            }
          />
          <Route
            path="/investor/dashboard"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/portfolio"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorPortfolio />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/offers"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorOffers />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/offers/:id"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorOfferDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/invest/:offerId"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorInvest />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/investments/:id/status"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorInvestmentStatus />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/investments"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorInvestments />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/balance/:assetCode"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorBalance />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/payments"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorPayments />
              </PrivateRoute>
            }
          />
          <Route
            path="/investor/profile"
            element={
              <PrivateRoute requiredRole="investor">
                <InvestorProfile />
              </PrivateRoute>
            }
          />

          {/* Company Portal Routes */}
          <Route
            path="/company/login"
            element={
              <PublicRoute>
                <DevLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/company/register"
            element={
              <PublicRoute>
                <CompanyRegister />
              </PublicRoute>
            }
          />
          <Route
            path="/company/register-user"
            element={
              <PublicRoute>
                <CompanyRegisterUser />
              </PublicRoute>
            }
          />
          <Route
            path="/company/verify-email"
            element={
              <PublicRoute>
                <CompanyVerifyEmail />
              </PublicRoute>
            }
          />
          <Route
            path="/company/dashboard"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/profile"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyProfile />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/offers"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyOffersList />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/offers/create"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyOfferCreate />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/offers/:id"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyOfferDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/offers/:id/edit"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyOfferEdit />
              </PrivateRoute>
            }
          />
          <Route
            path="/company/users"
            element={
              <PrivateRoute requiredRole="company">
                <CompanyUsers />
              </PrivateRoute>
            }
          />

          {/* Admin Portal Routes */}
          <Route
            path="/admin/login"
            element={
              <PublicRoute>
                <DevLogin />
              </PublicRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/companies"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminCompaniesList />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/companies/:id"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminCompanyDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/offers"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminOffersList />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/offers/:id/review"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminOfferReview />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/investments/metrics"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminInvestmentsMetrics />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/investments/statistics"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminInvestmentsStatistics />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/investments/pending"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminInvestmentsPending />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/investors"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminInvestorsList />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/investors/:id"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminInvestorDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/tokens"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminTokensList />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/payments/process"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminPaymentsProcess />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/payments/history"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminPaymentsHistory />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/payments/statistics"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminPaymentsStatistics />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/admins"
            element={
              <PrivateRoute requiredRole="admin">
                <AdminAdminsList />
              </PrivateRoute>
            }
          />

          {/* Legacy routes - redirect to new structure */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/investors" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/payments" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
        </WalletProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
