import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Overview } from './pages/Overview';
import { Investors } from './pages/Investors';
import { Payments } from './pages/Payments';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <PrivateRoute>
              <Layout>
                <Overview />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/investors"
          element={
            <PrivateRoute>
              <Layout>
                <Investors />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/admin/payments"
          element={
            <PrivateRoute>
              <Layout>
                <Payments />
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
