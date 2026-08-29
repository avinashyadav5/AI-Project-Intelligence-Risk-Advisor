import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  ListChecks, Plus, Trash2, Lock, AlertTriangle, GitBranch, Calendar, X, Check,
} from 'lucide-react';
import {
  getMilestones, createMilestone, updateMilestone, deleteMilestone, errorMessage,
} from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SkeletonList, LoadingRegion } from './Skeleton';

/**
 * Project tasks and dependencies.
 *
 * Only the developer dashboard could create or move tasks, so a project
 * manager — the role that actually owns the schedule — had no way to enter a
 * single milestone. That mattered because the deterministic schedule forecast
 * is computed from these records: no milestones meant every project-level
 * forecast returned "insufficient data".
 *
 * There was also no delete anywhere, despite the endpoint existing.
 */

const STATUS_META = {
  not_started: { label: 'To do', color: '#64748b', bg: '#f8fafc' },
  in_progress: { label: 'In progress', color: '#0369a1', bg: '#f0f9ff' },
  blocked: { label: 'Blocked', color: '#b45309', bg: '#fffbeb' },
  completed: { label: 'Done', color: '#059669', bg: '#ecfdf5' },
};

const STATUS_ORDER = ['not_started', 'in_progress', 'blocked', 'completed'];

const TaskBoard = ({ projectId }) => {
  const { user } = useContext(AuthContext);
  const toast = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: '', dueDate: '', owner: '', dependencies: [] });

  const canEdit = ['pm', 'admin', 'developer'].includes(user?.role);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await getMilestones(projectId);
      setTasks(res.data || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load tasks.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setFormError('Give the task a name.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createMilestone({
        projectId,
        name: draft.name.trim(),
        owner: draft.owner.trim() || null,
        dueDate: draft.dueDate || null,
        dependencies: draft.dependencies,
      });
      setDraft({ name: '', dueDate: '', owner: '', dependencies: [] });
      setShowForm(false);
      toast.success('Task added.');
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create the task.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (task, status) => {
    try {
      const res = await updateMilestone(task.id, { status });
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...res.data } : t)));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the task.'));
    }
  };

  const handleDelete = async (task) => {
    try {
      await deleteMilestone(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast.success(`Removed "${task.name}".`);
      load(); // dependency links elsewhere may have changed
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the task.'));
    }
  };

  if (!projectId) return null;

  const overdue = tasks.filter(t => t.isOverdue).length;
  const undated = tasks.filter(t => !t.dueDate && t.status !== 'completed').length;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={18} color="#4f46e5" /> Tasks and milestones
            {tasks.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>
                {tasks.length}
              </span>
            )}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Due dates here drive the schedule forecast.
            {overdue > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}> {overdue} overdue.</span>}
            {undated > 0 && <span style={{ color: '#b45309' }}> {undated} without a due date.</span>}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowForm(v => !v); setFormError(''); }}
            className="btn-primary"
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add task</>}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label htmlFor="task-name" className="form-label">Task name</label>
              <input
                id="task-name"
                className="form-input"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Integrate payment gateway"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="task-owner" className="form-label">Owner</label>
              <input
                id="task-owner"
                className="form-input"
                value={draft.owner}
                onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))}
                placeholder="Who is doing it"
              />
            </div>
            <div>
              <label htmlFor="task-due" className="form-label">Due date</label>
              <input
                id="task-due"
                type="date"
                className="form-input"
                value={draft.dueDate}
                onChange={e => setDraft(d => ({ ...d, dueDate: e.target.value }))}
              />
            </div>
          </div>

          {tasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <label htmlFor="task-deps" className="form-label">Depends on</label>
              <select
                id="task-deps"
                multiple
                className="form-input"
                style={{ minHeight: 72, fontSize: 13 }}
                value={draft.dependencies}
                onChange={e => setDraft(d => ({
                  ...d,
                  dependencies: Array.from(e.target.selectedOptions, o => o.value),
                }))}
              >
                {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Dependencies define the critical path in the forecast.
              </p>
            </div>
          )}

          <div aria-live="polite">
            {formError && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#b91c1c' }}>{formError}</p>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 12, fontSize: 13 }}>
            {saving ? 'Adding...' : 'Add task'}
          </button>
        </form>
      )}

      {loading && (
        <div style={{ marginTop: 16 }}>
          <LoadingRegion label="Loading tasks"><SkeletonList rows={3} /></LoadingRegion>
        </div>
      )}

      {error && <p style={{ fontSize: 13, color: '#b91c1c', margin: '12px 0 0' }}>{error}</p>}

      {!loading && !error && tasks.length === 0 && (
        <div style={{ marginTop: 16, padding: '24px 20px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
            No tasks yet. Add a few with due dates, or upload a task-list CSV, and the
            schedule forecast will start working.
          </p>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {tasks.map(task => {
            const meta = STATUS_META[task.status] || STATUS_META.not_started;
            const blockers = task.blockedBy || [];
            return (
              <div
                key={task.id}
                style={{
                  padding: 12, borderRadius: 10, border: '1px solid #e2e8f0',
                  background: task.isOverdue ? '#fffbfb' : '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a',
                      textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                      opacity: task.status === 'completed' ? 0.6 : 1,
                    }}>
                      {task.name}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: meta.color, background: meta.bg, padding: '3px 8px', borderRadius: 99 }}>
                        {meta.label}
                      </span>
                      {task.owner && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: 99 }}>
                          {task.owner}
                        </span>
                      )}
                      {task.dueDate && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                          color: task.isOverdue ? '#b91c1c' : '#475569',
                          background: task.isOverdue ? '#fef2f2' : '#f1f5f9',
                        }}>
                          {task.isOverdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {blockers.length > 0 && (
                        <span
                          title={`Waiting on: ${blockers.map(b => b.name).join(', ')}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '3px 8px', borderRadius: 99 }}
                        >
                          <Lock size={9} /> Waiting on {blockers.length}
                        </span>
                      )}
                      {(task.dependsOn || []).length > 0 && blockers.length === 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: 99 }}>
                          <GitBranch size={9} /> Unblocked
                        </span>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <label htmlFor={`status-${task.id}`} className="sr-only">
                        Status for {task.name}
                      </label>
                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        onChange={e => handleStatus(task, e.target.value)}
                        style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569' }}
                      >
                        {STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleDelete(task)}
                        title={`Delete ${task.name}`}
                        aria-label={`Delete ${task.name}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4, display: 'flex' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseOut={e => (e.currentTarget.style.color = '#cbd5e1')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}

                  {!canEdit && task.status === 'completed' && (
                    <Check size={16} color="#059669" style={{ flexShrink: 0 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskBoard;
