import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

/**
 * Toast notifications.
 *
 * The app used window.alert() in eleven places. Native alerts block the whole
 * page, cannot be styled, look like a browser security warning, and on mobile
 * they steal focus. These are non-blocking, dismissable and announced to
 * screen readers via an aria-live region.
 */

const ToastContext = createContext({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

export const useToast = () => useContext(ToastContext);

const ICONS = {
  success: { icon: CheckCircle, color: '#059669' },
  error: { icon: AlertCircle, color: '#dc2626' },
  info: { icon: Info, color: '#4f46e5' },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info', duration = 5000) => {
    if (!message) return;
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);

    // Errors linger, since the person may need to read and act on them.
    const life = type === 'error' ? Math.max(duration, 8000) : duration;
    setTimeout(() => dismiss(id), life);
  }, [dismiss]);

  const value = {
    toast,
    success: useCallback((m, d) => toast(m, 'success', d), [toast]),
    error: useCallback((m, d) => toast(m, 'error', d), [toast]),
    info: useCallback((m, d) => toast(m, 'info', d), [toast]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Assertive so errors interrupt; the region exists even when empty so
          screen readers register it before the first message arrives. */}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map(t => {
          const meta = ICONS[t.type] || ICONS.info;
          const Icon = meta.icon;
          return (
            <div
              key={t.id}
              className={`toast ${t.type}`}
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            >
              <Icon size={18} color={meta.color} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
              <button
                className="toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastContext;
