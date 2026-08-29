import { SkeletonList, LoadingRegion } from './Skeleton';
import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Users, Crown, Shield, Zap, ShieldAlert, Mail, X } from 'lucide-react';
import { getTeamMembers, removeMember, errorMessage } from '../services/api';
import { AuthContext } from '../context/AuthContext';

/**
 * Project team roster.
 *
 * GET /api/teams/:projectId existed on the server but nothing on the client
 * called it, so there was no way to see who was on a project or which invites
 * were still outstanding.
 */

const ROLE_STYLE = {
  pm: { label: 'Manager', icon: Shield, color: '#4f46e5', bg: '#eef2ff' },
  admin: { label: 'Admin', icon: Crown, color: '#b45309', bg: '#fffbeb' },
  developer: { label: 'Developer', icon: Zap, color: '#0369a1', bg: '#f0f9ff' },
  auditor: { label: 'Auditor', icon: ShieldAlert, color: '#b91c1c', bg: '#fef2f2' },
};

const TeamPanel = ({ projectId }) => {
  const { user } = useContext(AuthContext);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canManage = user?.role === 'pm' || user?.role === 'admin';

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await getTeamMembers(projectId);
      setMembers(res.data.members || []);
      setPending(res.data.pendingInvites || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the team.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (member) => {
    try {
      await removeMember(projectId, member.userId);
      setMembers(prev => prev.filter(m => m.userId !== member.userId));
    } catch (err) {
      setError(errorMessage(err, 'Could not remove that person.'));
    }
  };

  if (!projectId) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={18} color="#7c3aed" /> Team
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>
          {members.length}
        </span>
      </h3>

      {loading && (
        <div style={{ marginTop: 12 }}>
          <LoadingRegion label="Loading the team"><SkeletonList rows={3} /></LoadingRegion>
        </div>
      )}
      {error && <p style={{ fontSize: 13, color: '#b91c1c', margin: '12px 0 0' }}>{error}</p>}

      {!loading && members.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {members.map(m => {
            const style = ROLE_STYLE[m.role] || ROLE_STYLE.developer;
            const Icon = style.icon;
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10, border: '1px solid #f1f5f9',
              }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', background: style.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 13, fontWeight: 800, color: style.color,
                }}>
                  {(m.name || '?').charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {m.name}
                    {m.isOwner && <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309' }}>OWNER</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.email}
                  </span>
                </span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  color: style.color, background: style.bg, padding: '3px 8px', borderRadius: 99,
                }}>
                  <Icon size={10} /> {style.label}
                </span>
                {canManage && !m.isOwner && m.userId !== user?.id && (
                  <button
                    onClick={() => handleRemove(m)}
                    title={`Remove ${m.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2, display: 'flex' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseOut={e => (e.currentTarget.style.color = '#cbd5e1')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && pending.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Waiting to accept
          </p>
          {pending.map(inv => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', padding: '4px 0' }}>
              <Mail size={12} color="#94a3b8" />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</span>
              <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8' }}>{inv.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
