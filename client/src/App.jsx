import React, { useContext, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

// Split per route: the report page pulls in html2pdf and the dashboards
// pull in recharts, and neither is needed to render the login screen.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PMDashboard = lazy(() => import('./pages/PMDashboard'));
const DeveloperDashboard = lazy(() => import('./pages/DeveloperDashboard'));
const AuditorDashboard = lazy(() => import('./pages/AuditorDashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const UploadDocuments = lazy(() => import('./pages/UploadDocuments'));
const RiskReport = lazy(() => import('./pages/RiskReport'));
const RiskReports = lazy(() => import('./pages/RiskReports'));
const Chat = lazy(() => import('./pages/Chat'));
const Join = lazy(() => import('./pages/Join'));


const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) return <div style={{ padding: 32, color: '#64748b' }}>Loading...</div>;

  if (!user) {
    // Remember the destination so signing in resumes it — an invite link is
    // useless if it drops you on the dashboard.
    const intended = `${location.pathname}${location.search}`;
    if (intended && intended !== '/dashboard') {
      sessionStorage.setItem('redirectAfterLogin', intended);
    }
    return <Navigate to="/login" replace />;
  }

  return children;
};

const RouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    style={{ padding: 48, display: 'flex', alignItems: 'center', gap: 12, color: '#64748b' }}
  >
    <span className="spinner" aria-hidden="true" />
    Loading...
  </div>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const mainContent = document.getElementById('main-scroll-container');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const RoleBasedDashboard = () => {
  const { user } = useContext(AuthContext);
  if (!user) return <Navigate to="/login" />;
  
  switch(user.role) {
    case 'admin':
    case 'pm':
      return <PMDashboard />;
    case 'auditor':
      return <AuditorDashboard />;
    case 'developer':
    default:
      return <DeveloperDashboard />;
  }
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/*" element={
            <PrivateRoute>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <a href="#main-scroll-container" className="skip-link">Skip to main content</a>
                <Navbar />
                <main id="main-scroll-container" tabIndex={-1} aria-label="Main content" className="pad-mobile" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                  <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/dashboard" element={<RoleBasedDashboard />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/upload" element={<UploadDocuments />} />
                    <Route path="/overview" element={<Dashboard />} />
                    <Route path="/reports" element={<RiskReports />} />
                    <Route path="/report/:id" element={<RiskReport />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/join" element={<Join />} />

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                  </Suspense>
                </main>
              </div>
            </PrivateRoute>
          } />
        </Routes>
      </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
