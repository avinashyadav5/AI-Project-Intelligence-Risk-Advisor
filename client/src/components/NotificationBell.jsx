import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Sparkles, UserPlus, Clock, Check } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';

/**
 * The navbar bell was a button with no handler and the Notification table had
 * no route behind it. This reads real notifications, shows the unread count,
 * and navigates to whatever the notification is about.
 */

const ICONS = {
  risk: { icon: AlertTriangle, color: '#dc2626', bg: '#fef2f2' },
  analysis: { icon: Sparkles, color: '#4f46e5', bg: '#eef2ff' },
  invite: { icon: UserPlus, color: '#0891b2', bg: '#ecfeff' },
  deadline: { icon: Clock, color: '#ea580c', bg: '#fff7ed' },
};

const relativeTime = (value) => {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
};

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await getNotifications({ limit: 20 });
      setItems(res.data.notifications || []);
      setUnread(res.data.unreadCount || 0);
    } catch {
      // A failed poll should never interrupt what the person is doing.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const handleOpenItem = async (item) => {
    if (!item.isRead) {
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnread(u => Math.max(0, u - 1));
      markNotificationRead(item.id).catch(() => load());
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const handleReadAll = async () => {
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button
        onClick={openPanel}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 8,
          color: '#64748b', borderRadius: 8, display: 'flex', position: 'relative',
          transition: 'background 0.15s ease',
        }}
        onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
        onMouseOut={e => (e.currentTarget.style.background = 'none')}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
            padding: '0 4px', borderRadius: 99, background: '#dc2626', color: '#fff',
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 420,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 10px 30px rgba(15,23,42,0.12)', zIndex: 60,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={handleReadAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: '#4f46e5',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && items.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8', margin: 0 }}>
                Loading...
              </p>
            )}

            {!loading && items.length === 0 && (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <Bell size={28} style={{ color: '#cbd5e1', marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                  Nothing yet. Upload a document to start getting risk alerts.
                </p>
              </div>
            )}

            {items.map(item => {
              const meta = ICONS[item.type] || ICONS.analysis;
              const Icon = meta.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleOpenItem(item)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
                    background: item.isRead ? '#fff' : '#f8faff',
                    borderBottom: '1px solid #f8fafc',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseOut={e => (e.currentTarget.style.background = item.isRead ? '#fff' : '#f8faff')}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, background: meta.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={14} color={meta.color} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontSize: 13, lineHeight: 1.5,
                      color: item.isRead ? '#475569' : '#0f172a',
                      fontWeight: item.isRead ? 400 : 600,
                    }}>
                      {item.message}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
