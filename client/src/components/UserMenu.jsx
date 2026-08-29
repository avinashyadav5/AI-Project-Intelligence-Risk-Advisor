import React, { useState, useRef, useEffect, useContext } from 'react';
import { LogOut, ChevronDown, Shield, Zap, ShieldAlert, Crown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

/**
 * Account menu.
 *
 * The avatar in the navbar was a button with no click handler, and `logout`
 * existed in AuthContext but was never called anywhere in the app — there was
 * literally no way to sign out short of clearing localStorage.
 */

const ROLE_LABEL = {
  admin: { label: 'Admin', icon: Crown, color: '#b45309' },
  pm: { label: 'Project manager', icon: Shield, color: '#4f46e5' },
  developer: { label: 'Developer', icon: Zap, color: '#0369a1' },
  auditor: { label: 'Auditor', icon: ShieldAlert, color: '#b91c1c' },
};

const UserMenu = () => {
  const { user, logout } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };

    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const role = ROLE_LABEL[user.role] || ROLE_LABEL.developer;
  const RoleIcon = role.icon;
  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();

  return (
    <div style={{ position: 'relative' }} ref={wrapperRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name || user.email}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px',
          background: open ? '#f1f5f9' : 'none', border: '1px solid transparent',
          borderRadius: 99, cursor: 'pointer', transition: 'background 0.15s ease',
        }}
        onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
        onMouseOut={e => (e.currentTarget.style.background = open ? '#f1f5f9' : 'none')}
      >
        <span style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #eef2ff, #c7d2fe)',
          border: '1px solid #a5b4fc', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontSize: 13, fontWeight: 800, color: '#4f46e5',
        }}>
          {initial}
        </span>
        <ChevronDown
          size={14}
          color="#94a3b8"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
        />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 46, right: 0, width: 260,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            boxShadow: '0 10px 30px rgba(15,23,42,0.12)', zIndex: 60, overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              {user.name}
            </p>
            <p style={{
              margin: '2px 0 8px', fontSize: 12, color: '#94a3b8',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.4px', color: role.color,
              background: '#f8fafc', border: '1px solid #e2e8f0',
              padding: '3px 8px', borderRadius: 99,
            }}>
              <RoleIcon size={10} /> {role.label}
            </span>
          </div>

          <button
            role="menuitem"
            onClick={logout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#b91c1c',
              textAlign: 'left',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
