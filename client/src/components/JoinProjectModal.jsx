import useDialog from '../hooks/useDialog';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X, ArrowRight } from 'lucide-react';
import { joinProject, errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';

/**
 * Join a project with an invite link or token.
 *
 * Both the developer and auditor dashboards used window.prompt() for this,
 * which cannot be styled, cannot show validation, cannot be cancelled cleanly
 * on mobile, and gave no indication of what a valid token looks like.
 */
const JoinProjectModal = ({ isOpen, onClose, onJoined }) => {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const navigate = useNavigate();

  useDialog(isOpen, onClose);

  if (!isOpen) return null;

  /** Accept a full invite URL or a bare token. */
  const extractToken = (input) => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (trimmed.includes('token=')) {
      try {
        return new URL(trimmed, window.location.origin).searchParams.get('token') || '';
      } catch {
        const match = trimmed.match(/token=([^&\s]+)/);
        return match ? match[1] : '';
      }
    }
    return trimmed;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError('Paste the invite link or the token from it.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await joinProject(token);
      toast.success('You have joined the project.');
      onClose();
      setValue('');
      if (onJoined) onJoined(res.data.projectId);
      else navigate(`/upload?project=${res.data.projectId}`);
    } catch (err) {
      setError(errorMessage(err, 'That invite could not be accepted.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 id="join-modal-title" className="font-bold text-slate-900 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" /> Join a project
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="invite-token" className="block text-sm font-medium text-slate-700 mb-1">
              Invite link or token
            </label>
            <input
              id="invite-token"
              type="text"
              autoFocus
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              placeholder="https://…/join?token=abc123  or  abc123"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-describedby={error ? 'invite-error' : 'invite-help'}
            />
            {error ? (
              <p id="invite-error" className="text-xs text-rose-600 mt-1.5">{error}</p>
            ) : (
              <p id="invite-help" className="text-xs text-slate-400 mt-1.5">
                An invite only works for the email address it was sent to.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? 'Joining...' : <>Join <ArrowRight size={16} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JoinProjectModal;
