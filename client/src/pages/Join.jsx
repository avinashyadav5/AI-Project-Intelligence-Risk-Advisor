import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Users, ArrowRight } from 'lucide-react';
import { joinProject, errorMessage } from '../services/api';
import { AuthContext } from '../context/AuthContext';

/**
 * Accepts a project invite.
 *
 * The server has always produced invite links of the form /join?token=...,
 * and the PM invite modal showed them, but no such route existed — every
 * invite link dropped the recipient on the dashboard with no explanation.
 */
const Join = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const token = params.get('token') || '';
  const [state, setState] = useState('idle'); // idle | joining | success | error
  const [message, setMessage] = useState('');
  const [projectId, setProjectId] = useState(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('That link is missing its invite code. Ask for a fresh invite link.');
    }
  }, [token]);

  const handleJoin = async () => {
    setState('joining');
    try {
      const res = await joinProject(token);
      setProjectId(res.data.projectId);
      setMessage(res.data.message || 'You have joined the project.');
      setState('success');
    } catch (err) {
      setMessage(errorMessage(err, 'That invite could not be accepted.'));
      setState('error');
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 520, margin: '40px auto' }}>
      <div className="card">
        <div style={{
          width: 48, height: 48, borderRadius: 12, marginBottom: 16,
          background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Users size={24} color="#6366f1" />
        </div>

        {state !== 'success' && state !== 'error' && (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
              Join this project
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              You are signed in as <strong>{user?.email}</strong>. An invite can only be
              accepted by the person it was sent to, so if it was addressed to a different
              address, sign in with that account first.
            </p>
            <button
              onClick={handleJoin}
              disabled={state === 'joining' || !token}
              className="btn-primary"
              style={{ opacity: state === 'joining' ? 0.7 : 1 }}
            >
              {state === 'joining' ? 'Joining...' : 'Accept invite'}
              <ArrowRight size={16} />
            </button>
          </>
        )}

        {state === 'success' && (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={22} color="#059669" /> You're in
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => navigate(`/upload?project=${projectId}`)} className="btn-primary">
                Open project hub <ArrowRight size={16} />
              </button>
              <Link
                to="/dashboard"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#475569', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
              >
                Go to dashboard
              </Link>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={22} color="#dc2626" /> Invite not accepted
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#b91c1c', lineHeight: 1.6 }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {token && (
                <button onClick={handleJoin} className="btn-primary">Try again</button>
              )}
              <Link
                to="/dashboard"
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#475569', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
              >
                Go to dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Join;
