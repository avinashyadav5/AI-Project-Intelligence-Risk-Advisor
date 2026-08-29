import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, UploadCloud,
  ShieldAlert, Zap,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/projects',   label: 'Projects',         icon: FolderKanban },
  { to: '/upload',     label: 'Upload Documents', icon: UploadCloud },
  { to: '/reports',    label: 'Risk Reports',     icon: ShieldAlert },
];

const Sidebar = () => (
  <div className="sidebar">
    {/* Logo */}
    <div className="sidebar-logo">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(99,102,241,0.5)',
        }}>
          <Zap size={18} color="#fff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>Development of AI Powered Health Monitoring & Risk Analysis Platform</h1>
          <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            AI Powered
          </span>
        </div>
      </div>
    </div>

    {/* Nav */}
    <nav className="sidebar-nav">
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase', padding: '8px 14px 4px', marginBottom: 2 }}>
        Navigation
      </div>
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>

    {/* Footer */}
    <div className="sidebar-footer">
      <div style={{ fontSize: 11, color: '#334155', marginBottom: 2 }}>Powered by</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>Groq + LLaMA 3.3</div>
    </div>
  </div>
);

export default Sidebar;
