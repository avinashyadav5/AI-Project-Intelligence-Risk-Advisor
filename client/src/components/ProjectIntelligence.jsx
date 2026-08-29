import { SkeletonStats, LoadingRegion } from './Skeleton';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, AlertTriangle, Target, Clock, ShieldAlert, RefreshCw,
  CalendarClock, GitBranch, FileWarning, ChevronDown, ChevronUp,
} from 'lucide-react';
import { runProjectAnalysis, getProjectIntelligence, errorMessage } from '../services/api';

/**
 * Project-level intelligence.
 *
 * Analysis used to happen one document at a time, and the dashboards simply
 * averaged those per-file scores. This runs the multi-agent pipeline across the
 * project's whole knowledge base and shows the result as a single view of the
 * project — which is what the brief actually asks for.
 */

const bandColor = (level) => {
  const l = String(level || '').toLowerCase();
  if (l === 'critical') return { fg: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  if (l === 'high') return { fg: '#ea580c', bg: '#fff7ed', border: '#fed7aa' };
  if (l === 'medium') return { fg: '#ca8a04', bg: '#fefce8', border: '#fde68a' };
  if (l === 'low') return { fg: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
  return { fg: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
};

const Stat = ({ label, value, suffix, tone }) => (
  <div style={{
    flex: '1 1 130px', padding: 16, borderRadius: 12,
    background: tone?.bg || '#f8fafc', border: `1px solid ${tone?.border || '#e2e8f0'}`,
  }}>
    <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: tone?.fg || '#0f172a', lineHeight: 1.1 }}>
      {value ?? '—'}
      {suffix && value != null && <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>{suffix}</span>}
    </p>
    <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {label}
    </p>
  </div>
);

const Section = ({ title, icon: Icon, iconColor, children, defaultOpen = false, count }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, marginTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
          <Icon size={16} color={iconColor} /> {title}
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99 }}>
              {count}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
};

const ProjectIntelligence = ({ projectId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getProjectIntelligence(projectId);
      setData(res.data.exists ? res.data : null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the project analysis.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    try {
      await runProjectAnalysis(projectId);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Project analysis failed.'));
    } finally {
      setRunning(false);
    }
  };

  if (!projectId) return null;

  const schedule = data?.scheduleForecast || {};
  const health = data?.projectHealth || {};
  const riskTone = bandColor(data?.riskLevel);
  const scheduleTone = bandColor(schedule.risk_level);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#4f46e5" /> Project Intelligence
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {data
              ? `Across ${data.documentsCovered} document${data.documentsCovered === 1 ? '' : 's'} and ${data.milestonesUsed} task${data.milestonesUsed === 1 ? '' : 's'} · ${new Date(data.createdAt).toLocaleString()}`
              : 'Analyse every uploaded document together, as one project.'}
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="btn-primary"
          style={{ fontSize: 13, padding: '8px 16px', opacity: running ? 0.7 : 1 }}
        >
          <RefreshCw size={14} style={{ animation: running ? 'spin 1s linear infinite' : 'none' }} />
          {running ? 'Analysing...' : data ? 'Run again' : 'Run analysis'}
        </button>
      </div>

      {error && (
        <p style={{ margin: '16px 0 0', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </p>
      )}

      {loading && !data && (
        <div style={{ marginTop: 20 }}>
          <LoadingRegion label="Loading the project analysis"><SkeletonStats count={4} /></LoadingRegion>
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ marginTop: 20, padding: '28px 20px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
          <Target size={28} style={{ color: '#cbd5e1', marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
            No project-level analysis yet. Run one to combine every document into a
            single view of scope, risk, health and schedule.
          </p>
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <Stat label="Health" value={health.score ?? data.healthScore} suffix="/100" tone={{ bg: '#f8fafc', border: '#e2e8f0', fg: '#0f172a' }} />
            <Stat label={`Risk · ${data.riskLevel || '—'}`} value={data.riskScore} suffix="/100" tone={riskTone} />
            <Stat label="Grade" value={data.healthGrade} tone={{ bg: '#eef2ff', border: '#c7d2fe', fg: '#4338ca' }} />
            <Stat label="Confidence" value={data.confidence} suffix="%" tone={{ bg: '#f8fafc', border: '#e2e8f0', fg: '#0f172a' }} />
          </div>

          {data.summary && (
            <p style={{ margin: '16px 0 0', fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
              {data.summary}
            </p>
          )}

          {/* Schedule — the numbers here are computed from real dates, not narrated */}
          <Section title="Schedule forecast" icon={CalendarClock} iconColor="#ea580c" defaultOpen>
            {schedule.status === 'insufficient_data' ? (
              <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                {schedule.reasoning || 'Add tasks with due dates to enable schedule forecasting.'}
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Stat label="Schedule risk" value={schedule.schedule_risk_score} suffix="/100" tone={scheduleTone} />
                  <Stat label="Overdue" value={schedule.overdue?.length} tone={{ bg: '#fff7ed', border: '#fed7aa', fg: '#c2410c' }} />
                  <Stat label="Blocked" value={schedule.blocked_tasks?.length} tone={{ bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' }} />
                  <Stat label="Slip (days)" value={schedule.projected_slip_days} tone={{ bg: '#f8fafc', border: '#e2e8f0', fg: '#0f172a' }} />
                </div>

                {schedule.projected_completion && (
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>
                    Planned finish <strong>{schedule.baseline_completion}</strong> · projected finish{' '}
                    <strong style={{ color: scheduleTone.fg }}>{schedule.projected_completion}</strong>
                  </p>
                )}

                {schedule.critical_path?.path?.length > 1 && (
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <GitBranch size={14} style={{ marginTop: 3, flexShrink: 0 }} color="#7c3aed" />
                    <span>
                      <strong>Critical path ({schedule.critical_path.length_days}d):</strong>{' '}
                      {schedule.critical_path.path.join(' → ')}
                    </span>
                  </p>
                )}

                {schedule.delay_factors?.length > 0 && (
                  <ul style={{ margin: '0 0 8px', paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                    {schedule.delay_factors.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {schedule.reasoning && (
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {schedule.reasoning}
                  </p>
                )}
              </>
            )}
          </Section>

          {data.blockers?.length > 0 && (
            <Section title="Blockers" icon={AlertTriangle} iconColor="#dc2626" count={data.blockers.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.blockers.map((b, i) => {
                  const tone = bandColor(b.severity);
                  return (
                    <div key={i} style={{ padding: 12, borderRadius: 10, background: tone.bg, border: `1px solid ${tone.border}` }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{b.description}</p>
                      {b.mitigation && b.mitigation !== 'None' && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Mitigation: {b.mitigation}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {data.riskRegister?.length > 0 && (
            <Section title="Risk register" icon={ShieldAlert} iconColor="#dc2626" count={data.riskRegister.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.riskRegister.slice(0, 8).map((r, i) => (
                  <div key={i} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
                        {r.category}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{r.description}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {data.missingDocs?.length > 0 && (
            <Section title="Missing documentation" icon={FileWarning} iconColor="#ea580c" count={data.missingDocs.length}>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                {data.missingDocs.map((d, i) => (
                  <li key={i}><strong>{d.document_type}</strong> — {d.reason}</li>
                ))}
              </ul>
            </Section>
          )}

          {data.sourceDocuments?.length > 0 && (
            <p style={{ margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
              <Clock size={11} style={{ verticalAlign: -1 }} /> Grounded in: {data.sourceDocuments.join(', ')}
            </p>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ProjectIntelligence;
