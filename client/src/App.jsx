import React, { useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import PMDashboard from './pages/PMDashboard';
import DeveloperDashboard from './pages/DeveloperDashboard';
import AuditorDashboard from './pages/AuditorDashboard';
import Projects from './pages/Projects';
import UploadDocuments from './pages/UploadDocuments';
import RiskReport from './pages/RiskReport';
import RiskReports from './pages/RiskReports';
import Chat from './pages/Chat';
import Login from './pages/Login';
import Register from './pages/Register';


const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Loading...</div>;
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Loading...</div>;
  return (user && user.role === 'admin') ? children : <Navigate to="/dashboard" replace />;
};

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
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/*" element={
            <PrivateRoute>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <Navbar />
                <main id="main-scroll-container" className="pad-mobile" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                  <Routes>
                    <Route path="/dashboard" element={<RoleBasedDashboard />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/upload" element={<UploadDocuments />} />
                    <Route path="/reports" element={<RiskReports />} />
                    <Route path="/report/:id" element={<RiskReport />} />
                    <Route path="/chat" element={<Chat />} />

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            </PrivateRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
