import React, { useState, useEffect, useCallback } from 'react';
import { getStats, getProjects } from '../services/api';
import { FolderKanban, FileText, BarChart2, TrendingUp, RefreshCw, ArrowRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

const StatCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className={`stat-card ${color} fade-in`}>
    <div className={`stat-icon ${color}`}>
      <Icon size={22} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [statsRes, projRes] = await Promise.all([getStats(), getProjects()]);
      setStats(statsRes.data);
      setProjects(projRes.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Could not load dashboard data. Make sure the backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const riskColor = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Critical: '#dc2626' };
  const totalDocs = stats?.totalDocuments ?? 0;
  const analyzedDocs = stats?.analyzedDocuments ?? 0;
  const analysisPct = totalDocs > 0 ? Math.round((analyzedDocs / totalDocs) * 100) : 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: '#94a3b8', fontSize: 14 }}>
      <div className="spinner" /> Loading dashboard...
    </div>
  );

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time overview of your projects and AI risk analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => fetchAll(true)} disabled={refreshing} style={{ fontSize: 13, padding: '8px 14px' }}>
            <RefreshCw size={13} style={refreshing ? { animation: 'spin 0.7s linear infinite' } : {}} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/projects" className="btn-primary" style={{ textDecoration: 'none', fontSize: 13 }}>
            <Plus size={14} /> New Project
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#be185d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => fetchAll()} style={{ background: 'none', border: 'none', color: '#be185d', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Projects"    value={stats?.totalProjects ?? 0}    icon={FolderKanban} color="indigo" />
        <StatCard label="Total Documents"   value={totalDocs}                     icon={FileText}     color="emerald" />
        <StatCard
          label="Analyzed"
          value={analyzedDocs}
          icon={BarChart2}
          color="amber"
          sub={totalDocs > 0 ? `${analysisPct}% complete` : 'Upload docs to begin'}
        />
        <StatCard
          label="Avg Risk Score"
          value={stats?.avgRiskScore != null ? stats.avgRiskScore : '—'}
          icon={TrendingUp}
          color="rose"
          sub={stats?.avgRiskScore != null ? (stats.avgRiskScore >= 45 ? '⚠ Elevated risk' : '✓ Normal range') : 'No data yet'}
        />
      </div>

      <div className="grid-cols-1-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Recent Projects */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent Projects</h3>
            <Link to="/projects" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="empty-state">
              <FolderKanban size={32} />
              <p>No projects yet.</p>
              <Link to="/projects" className="btn-primary" style={{ textDecoration: 'none', marginTop: 12, fontSize: 13 }}>
                <Plus size={14} /> Create First Project
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Description</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 6).map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FolderKanban size={14} color="#6366f1" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {p.description}
                    </td>
                    <td style={{ color: '#94a3b8', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Risk Distribution */}
        <div className="card">
          <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700 }}>Risk Distribution</h3>
          {!stats?.riskDistribution || Object.values(stats.riskDistribution).every(v => v === 0) ? (
            <div className="empty-state">
              <BarChart2 size={32} />
              <p>No analyzed documents yet.<br />
                <Link to="/upload" style={{ color: '#6366f1', fontWeight: 600 }}>Upload a document →</Link>
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {['Critical', 'High', 'Medium', 'Low'].map(level => {
                const count = stats.riskDistribution[level] || 0;
                const pct = analyzedDocs > 0 ? Math.round((count / analyzedDocs) * 100) : 0;
                return (
                  <div key={level}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`risk-badge ${level}`}>{level}</span>
                      </div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>{count} doc{count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: riskColor[level] }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 4, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                {analyzedDocs} of {totalDocs} document{totalDocs !== 1 ? 's' : ''} analyzed
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/projects" className="btn-primary" style={{ textDecoration: 'none', fontSize: 13 }}>
            <FolderKanban size={15} /> New Project
          </Link>
          <Link to="/upload" className="btn-secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
            <FileText size={15} /> Upload Document
          </Link>
          <Link to="/reports" className="btn-secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
            <BarChart2 size={15} /> View Risk Reports
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
