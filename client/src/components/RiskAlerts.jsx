import { SkeletonList, LoadingRegion } from './Skeleton';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { getProjectAlerts, errorMessage } from '../services/api';

/**
 * Critical-risk alert history.
 *
 * Every document scoring 70 or above writes an AlertLog row. Nothing read that
 * table, so the alert history existed only in the database. The notification
 * bell surfaces new alerts; this is the record of past ones.
 */

const levelTone = (level) => {
  const l = String(level || '').toLowerCase();
  if (l === 'critical') return { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
  if (l === 'high') return { fg: '#c2410c', bg: '#fff7ed', border: '#fed7aa' };
  return { fg: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
};

const RiskAlerts = ({ projectId }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);

    getProjectAlerts(projectId)
      .then(res => { if (!cancelled) { setAlerts(res.data || []); setError(''); } })
      .catch(err => { if (!cancelled) setError(errorMessage(err, 'Could not load alerts.')); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={18} color="#dc2626" /> Risk alerts
        {alerts.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: 99 }}>
            {alerts.length}
          </span>
        )}
      </h3>

      {loading && (
        <div style={{ marginTop: 12 }}>
          <LoadingRegion label="Loading alerts"><SkeletonList rows={2} /></LoadingRegion>
        </div>
      )}
      {error && <p style={{ fontSize: 13, color: '#b91c1c', margin: '12px 0 0' }}>{error}</p>}

      {!loading && !error && alerts.length === 0 && (
        <p style={{ fontSize: 13, color: '#64748b', margin: '12px 0 0', lineHeight: 1.6 }}>
          No document has scored 70 or above. Alerts appear here automatically when one does.
        </p>
      )}

      {!loading && alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
          {alerts.map(alert => {
            const tone = levelTone(alert.riskLevel);
            const d = new Date(alert.createdAt);
            const timeStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            return (
              <Link
                key={alert.id}
                to={`/report/${alert.documentId}`}
                style={{
                  display: 'block', padding: 12, borderRadius: 10, textDecoration: 'none',
                  background: tone.bg, border: `1px solid ${tone.border}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {alert.riskLevel && (
                      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: tone.fg, background: tone.border, padding: '1px 6px', borderRadius: 99, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {alert.riskLevel}
                      </span>
                    )}
                    <p style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5, margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      {alert.message}
                    </p>
                  </div>
                  <ArrowRight size={14} color={tone.fg} style={{ flexShrink: 0, marginTop: 2 }} />
                </div>
                <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  {timeStr} · score {alert.riskScore}/100
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RiskAlerts;
