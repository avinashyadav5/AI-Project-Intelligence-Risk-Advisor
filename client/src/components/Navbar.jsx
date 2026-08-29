import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, UploadCloud,
  ShieldAlert, Zap, Bell, User, MessageSquare, Menu, X
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/projects',   label: 'Projects',        icon: FolderKanban },
  { to: '/upload',     label: 'Upload',          icon: UploadCloud },
  { to: '/reports',    label: 'Risk Reports',    icon: ShieldAlert },
  { to: '/chat',       label: 'Chat',            icon: MessageSquare },
];

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header style={{
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      padding: '0 24px',
      height: 70,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      position: 'relative'
    }} className="pad-mobile">
      {/* Left Side: Logo & Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button 
          className="hide-desktop" 
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'none' }}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <Menu size={24} color="#0f172a" />
        </button>
        <style>{`
          @media (max-width: 768px) {
            .hide-desktop { display: block !important; }
            .hide-on-mobile-nav { display: none !important; }
            .brand-text-mobile { font-size: 14px !important; }
          }
        `}</style>
        
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 10px rgba(99,102,241,0.3)',
          flexShrink: 0
        }}>
          <Zap size={20} color="#fff" />
        </div>
        <div>
          <h1 className="brand-text-mobile" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
            Development of AI Powered Health Monitoring & Risk Analysis Platform
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="hide-on-mobile-nav">
            <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              AI Powered
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#475569',
              background: '#f1f5f9', padding: '2px 6px', borderRadius: 99,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Beta
            </span>
          </div>
        </div>
      </div>

      {/* Center: Navigation Links (Desktop) */}
      <nav className="hide-on-mobile-nav" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item-h${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Right Side: Status & Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="hide-on-mobile-nav" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, color: '#10b981',
          background: '#ecfdf5', padding: '6px 12px', borderRadius: 99,
          border: '1px solid #d1fae5'
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          Groq
        </div>

        <div className="hide-on-mobile-nav" style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />

        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: '#64748b', borderRadius: 8, display: 'flex', transition: 'background 0.15s ease' }} onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
          <Bell size={18} />
        </button>
        <button style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, #eef2ff, #c7d2fe)',
          border: '1px solid #a5b4fc', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <User size={18} color="#4f46e5" />
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div style={{
          position: 'absolute',
          top: 70,
          left: 0,
          right: 0,
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          zIndex: 50,
          padding: '12px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              style={{ color: '#0f172a' }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
};

export default Navbar;
