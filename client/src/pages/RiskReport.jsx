import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { getDocument } from '../services/api';
import { LayoutDashboard, Filter, ArrowLeft, FileText, AlertTriangle, CheckCircle, Lightbulb, Shield, Clock, Download, Target, FileWarning, Search, Users, Activity, CheckSquare, Info, Wand2, X, AlertCircle, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import html2pdf from 'html2pdf.js';


// ── SVG Risk Gauge ─────────────────────────────────────────────────────────────
// WHY SVG: No charting library needed. A single SVG arc gives us a beautiful,
// animated gauge with zero bundle size cost.
const RiskGauge = ({ score, level }) => {
  const radius = 80;
  const stroke = 14;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  // Only draw a 240-degree arc (2/3 of circle, bottom cut off)
  const arcLength = circumference * (240 / 360);
  const offset = arcLength - (arcLength * Math.min(score, 100)) / 100;

  const color = score >= 70 ? '#dc2626' : score >= 45 ? '#ef4444' : score >= 20 ? '#f59e0b' : '#10b981';
  const trackColor = '#f1f5f9';

  return (
    <div className="gauge-container" style={{ width: 200, height: 160 }}>
      <svg width="200" height="160" viewBox="0 0 200 160">
        {/* rotate(150) starts the arc exactly at the bottom left (8 o'clock), 
            drawing 240 degrees to the bottom right (4 o'clock) */}
        <g transform="translate(100, 105) rotate(150)">
          {/* Track */}
          <circle
            cx="0" cy="0" r={normalizedRadius}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <circle
            cx="0" cy="0" r={normalizedRadius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
          />
        </g>
      </svg>
      <div className="gauge-text" style={{ paddingTop: 15 }}>
        <span className="gauge-score" style={{ color }}>{score ?? '—'}</span>
        <span className="gauge-label">/ 100</span>
        <span style={{ fontSize: 13, fontWeight: 700, color, marginTop: 4 }}>{level || '—'}</span>
      </div>
    </div>
  );
};

// ── Category bar ───────────────────────────────────────────────────────────────
const CategoryBar = ({ label, value }) => {
  if (value === null) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
          <span style={{ fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>{label.replace('_', ' ')}</span>
          <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11 }}>Not analyzed in this pass</span>
        </div>
      </div>
    );
  }

  // value is 0-100 from new API, or fallback to x10 if it's old 1-10 format
  const normalizedValue = value <= 10 ? value * 10 : value;
  const width = Math.min(Math.max(normalizedValue, 5), 100);
  const color = normalizedValue >= 70 ? '#ef4444' : normalizedValue >= 40 ? '#f59e0b' : '#10b981';

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
        <span style={{ fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>{label.replace('_', ' ')}</span>
        <span style={{ fontWeight: 700, color }}>{Math.round(normalizedValue)}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
};

// ── Insight row ───────────────────────────────────────────────────────────────
const InsightCard = ({ insight, index }) => {
  const sev = typeof insight === 'string' ? 'medium' : (insight.severity || 'medium');
  const text = typeof insight === 'string' ? insight : insight.text;
  const evidence = typeof insight === 'object' ? insight.evidence : null;
  const confidence = typeof insight === 'object' ? insight.confidence : null;
  const icon = { critical: AlertTriangle, high: AlertTriangle, medium: Lightbulb, low: CheckCircle };
  const Icon = icon[sev] || Lightbulb;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`insight-card-minimal ${sev} fade-in`} style={{ animationDelay: `${index * 0.07}s`, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
      <button onClick={handleCopy} style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : '#cbd5e1', padding: 4 }} title="Copy Insight">
        {copied ? <Check size={16} /> : <Copy size={16} className="hover:text-slate-500 transition-colors" />}
      </button>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', paddingRight: 24 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>{text}</p>
      </div>
      {evidence && (
        <div style={{ paddingLeft: '26px', fontSize: 13, color: '#64748b', fontStyle: 'italic', borderLeft: '2px solid rgba(0,0,0,0.1)', marginLeft: '6px' }}>
          "{evidence}"
        </div>
      )}
      {confidence != null && (
        <div style={{ paddingLeft: '26px', fontSize: 12, fontWeight: 700, color: confidence >= 80 ? '#10b981' : '#f59e0b' }}>
          AI Confidence: {confidence}%
        </div>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const RiskReport = () => {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Interactive States
  const [activeTab, setActiveTab] = useState('overview');
  const [riskFilter, setRiskFilter] = useState('all');
  const [dismissedBlockers, setDismissedBlockers] = useState(new Set());
  const [completedTasks, setCompletedTasks] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState({ deliverables: false, userStories: false, traceGaps: false });
  
  const reportRef = useRef();

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleTask = (taskIndex) => {
    setCompletedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskIndex)) next.delete(taskIndex);
      else next.add(taskIndex);
      return next;
    });
  };

  const dismissBlocker = (blockerIndex) => {
    setDismissedBlockers(prev => new Set(prev).add(blockerIndex));
  };

  const exportPDF = () => {
    const element = reportRef.current;
    const opt = {
      margin:       0.5,
      filename:     `RiskReport_${doc?.originalName}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await getDocument(id);
        setDoc(res.data);
      } catch (err) {
        setError('Could not load document report. It may still be processing.');
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#94a3b8', padding: 60, fontSize: 14 }}>
      <div className="spinner" /> Loading report...
    </div>
  );

  if (error) return (
    <div className="glass-panel" style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: '40px' }}>
      <AlertTriangle size={36} className="text-amber-500 mx-auto" style={{ marginBottom: 12 }} />
      <p className="text-slate-500">{error}</p>
      <Link to="/upload" className="btn-primary" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-flex' }}>
        Back to Upload
      </Link>
    </div>
  );

  const categories = doc.riskCategories || {};
  const hasCats = Object.values(categories).some(v => v > 0);

  return (
    <div className="fade-in" ref={reportRef}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', textDecoration: 'none', marginBottom: 12, fontWeight: 500 }}>
          <ArrowLeft size={14} /> Back to Documents
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>Risk Report</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#64748b', fontWeight: 500 }}>
                <FileText size={15} /> {doc.originalName}
              </span>
              {doc.projectId?.name && (
                <span style={{ fontSize: 13, color: '#94a3b8' }}>· {doc.projectId.name}</span>
              )}
              <span className={`risk-badge ${doc.status}`}>{doc.status}</span>
              {doc.analysisSource === 'groq' && (
                <span style={{ fontSize: 11, background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                  Groq AI
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-cols-1-mobile" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left column: gauge + meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
          {/* Gauge card */}
          <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#64748b', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
              Risk Score
              <Info size={14} color="#94a3b8" style={{ cursor: 'help' }} title="Weighted average of risk severity (probability × impact) across technical, timeline, financial, operational, and legal categories." />
            </h3>
            <RiskGauge score={doc.riskScore} level={doc.riskLevel} />
            <span className={`risk-badge ${doc.riskLevel}`} style={{ marginTop: 8, fontSize: 13, padding: '4px 14px' }}>
              {doc.riskLevel} Risk
            </span>
            {doc.riskCategories?._coverage?.low_coverage && (
              <div style={{ marginTop: 12, padding: '6px 10px', background: '#fffbeb', color: '#d97706', fontSize: 12, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fde68a' }}>
                <AlertTriangle size={14} />
                Partial analysis — based on {doc.riskCategories._coverage.categories_assessed} of 5 categories
              </div>
            )}
          </div>

          {/* Project Health */}
          {doc.projectHealth && (
            <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#64748b', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
                Project Health
                <Info size={14} color="#94a3b8" style={{ cursor: 'help' }} title="Weighted sum across planning, documentation, development, testing, and risk (inverse risk score)." />
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: doc.projectHealth.score >= 80 ? '#10b981' : doc.projectHealth.score >= 70 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>
                  {doc.projectHealth.score || '—'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: doc.projectHealth.grade?.match(/[AB]/) ? '#10b981' : doc.projectHealth.grade?.match(/C/) ? '#f59e0b' : '#ef4444' }}>
                  Grade: {doc.projectHealth.grade || '—'}
                </div>
                {doc.projectHealth.health_coverage?.low_coverage && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#fffbeb', color: '#d97706', fontSize: 12, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fde68a' }}>
                    <AlertTriangle size={14} />
                    Partial analysis — based on {doc.projectHealth.health_coverage.categories_assessed} of 5 axes
                  </div>
                )}
              </div>

              {doc.projectHealth.breakdown && Object.entries(doc.projectHealth.breakdown).filter(([k]) => k !== 'overall').length > 0 && (
                <div style={{ width: '100%', marginTop: 12, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(doc.projectHealth.breakdown).filter(([k]) => k !== 'overall').map(([key, val]) => (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#64748b', textTransform: 'capitalize' }}>{key}</span>
                        {val.score === null ? (
                          <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: 11 }}>Not analyzed in this pass</span>
                        ) : (
                          <span style={{ fontWeight: 700, color: val.score >= 70 ? '#10b981' : val.score >= 40 ? '#f59e0b' : '#ef4444' }}>{val.score}/100</span>
                        )}
                      </div>
                      {val.score !== null && (
                        <div className="progress-bar" style={{ height: 4 }}>
                          <div className="progress-fill" style={{ width: `${val.score}%`, background: val.score >= 70 ? '#10b981' : val.score >= 40 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Confidence Score */}
          {doc.confidence !== undefined && doc.confidence !== null && (
            <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#64748b', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
                AI Confidence
                <Info size={14} color="#94a3b8" style={{ cursor: 'help' }} title="Mean confidence computed from FAISS retrieval similarity and evidence quote presence." />
              </h3>
              {doc.analysisSource === 'keyword_fallback' ? (
                <>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#94a3b8', lineHeight: 1, marginTop: 8, marginBottom: 4 }}>
                    N/A — Fallback
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                    Keyword engine does not compute confidence scores.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, fontWeight: 800, color: doc.confidence >= 80 ? '#10b981' : doc.confidence >= 50 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>
                    {doc.confidence}%
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                    {doc.confidence >= 80 ? 'High confidence in extraction' : 'Manual review recommended'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Metadata card */}
          <div className="glass-panel" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#64748b' }}>Document Info</h3>
            {[
              { label: 'Word Count', value: doc.wordCount ? `${doc.wordCount.toLocaleString()} words` : '—' },
              { label: 'File Size', value: doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : '—' },
              { label: 'Uploaded', value: doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString() : '—' },
              { label: 'Processing', value: doc.processingTimeMs ? `${(doc.processingTimeMs / 1000).toFixed(2)}s` : '—' },
              { label: 'Engine', value: (doc.analysisSource === 'groq' || doc.analysisSource === 'groq_pipeline') ? 'Groq LLaMA 3.3' : 'Keyword Engine' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#94a3b8', fontWeight: 500 }}>{label}</span>
                <span style={{ fontWeight: 600, color: '#475569' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Risk categories */}
          {hasCats && (
            <div className="glass-panel" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#64748b' }}>Risk by Category</h3>
              {Object.entries(categories).filter(([cat]) => cat !== '_coverage' && cat !== 'overall_score').map(([cat, val]) => (
                <CategoryBar key={cat} label={cat} value={val} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: Main View Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          {/* Tabs Navigation */}
          <div className="tabs-container">
            <button className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
              <LayoutDashboard size={16} /> Overview
            </button>
            <button className={`tab-button ${activeTab === 'scope' ? 'active' : ''}`} onClick={() => setActiveTab('scope')}>
              <Target size={16} /> Scope & Delivery
            </button>
            <button className={`tab-button ${activeTab === 'risks' ? 'active' : ''}`} onClick={() => setActiveTab('risks')}>
              <Shield size={16} /> Risks & Blockers
            </button>
            <button className={`tab-button ${activeTab === 'execution' ? 'active' : ''}`} onClick={() => setActiveTab('execution')}>
              <CheckSquare size={16} /> Execution
            </button>
          </div>
                    {/* Summary */}
          {activeTab === 'overview' && doc.summary && (
            <div className="glass-panel" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={20} color="#6366f1" /> Document Summary
              </h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#475569' }}>{doc.summary}</p>
            </div>
          )}

                    {/* Key Insights */}
          {activeTab === 'overview' && (
          <div className="glass-panel" style={{ padding: 32 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} color="#f59e0b" /> Key Risk Insights
            </h3>
            {doc.keyInsights?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doc.keyInsights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} index={i} />
                ))}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: 15 }}>No specific risk insights flagged for this document.</p>
            )}
          </div>

                      )}


                    {/* Recommendations */}
          {activeTab === 'overview' && doc.recommendations?.length > 0 && (
            <div className="glass-panel" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={20} color="#10b981" /> Recommendations
              </h3>
              <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doc.recommendations.map((rec, i) => (
                  <li key={i} style={{ fontSize: 15, color: '#475569', lineHeight: 1.6 }}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

                    {/* Project Scope */}
          {activeTab === 'scope' && doc.scope && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={20} color="#4f46e5" /> Project Scope
              </h3>
              {doc.scope.objectives && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase' }}>Objectives</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: '#475569' }}>
                    {doc.scope.objectives.map((obj, i) => <li key={i}>{obj}</li>)}
                  </ul>
                </div>
              )}
              {doc.scope.boundaries && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase' }}>Boundaries</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: '#475569' }}>
                    {doc.scope.boundaries.map((obj, i) => <li key={i}>{obj}</li>)}
                  </ul>
                </div>
              )}
              {doc.scope.assumptions && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase' }}>Assumptions</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: '#475569' }}>
                    {doc.scope.assumptions.map((obj, i) => <li key={i}>{obj}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

                    {/* Deliverables */}
          {activeTab === 'scope' && doc.deliverables?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: expandedSections.deliverables ? 20 : 0 }} onClick={() => toggleSection('deliverables')}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={20} color="#0284c7" /> Deliverables
                </h3>
                {expandedSections.deliverables ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
              </div>
              {expandedSections.deliverables && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {doc.deliverables.map((del, i) => (
                    <div key={i} className="hover-lift" style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{del.name}</span>
                        {del.priority && <span style={{ fontSize: 12, background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: 99, fontWeight: 700 }}>{del.priority}</span>}
                      </div>
                      {del.description && <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>{del.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

                    {/* Blockers */}
          {activeTab === 'risks' && doc.blockers?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} color="#dc2626" /> Blockers & Impediments
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {doc.blockers.map((blocker, i) => !dismissedBlockers.has(i) && (
                  <div key={i} className={`insight-card-minimal ${blocker.severity || 'high'} p-4`} style={{ animationDelay: `${i * 0.07}s`, position: 'relative' }}>
                    <button onClick={() => dismissBlocker(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }} title="Dismiss Blocker">
                      <X size={16} className="hover:text-slate-700 transition-colors" />
                    </button>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, opacity: 0.8 }} />
                    <div style={{ flex: 1, paddingRight: 20 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>{blocker.description}</p>
                      {blocker.impact && <p style={{ margin: '0 0 6px', fontSize: 14, color: '#64748b' }}><strong>Impact:</strong> {blocker.impact}</p>}
                      {blocker.mitigation && <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}><strong>Mitigation:</strong> {blocker.mitigation}</p>}
                    </div>
                  </div>
                ))}
                {doc.blockers.every((_, i) => dismissedBlockers.has(i)) && (
                  <p style={{ margin: 0, fontSize: 14, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={16} /> All blockers resolved or dismissed.</p>
                )}
              </div>
            </div>
          )}

                    {/* Schedule Forecast */}
          {activeTab === 'overview' && doc.scheduleForecast && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Clock size={20} color="#ea580c" /> Schedule Forecast
                </h3>
                <span className={`risk-badge ${doc.scheduleForecast.riskLevel || 'medium'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                  {doc.scheduleForecast.riskLevel} Risk
                </span>
              </div>
              {doc.scheduleForecast.delayFactors?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Delay Factors</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: '#475569' }}>
                    {doc.scheduleForecast.delayFactors.map((factor, i) => <li key={i}>{factor}</li>)}
                  </ul>
                </div>
              )}
              {doc.scheduleForecast.recommendations?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Recommendations</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, color: '#475569' }}>
                    {doc.scheduleForecast.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

                    {/* User Stories */}
          {activeTab === 'execution' && doc.userStories?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: expandedSections.userStories ? 20 : 0 }} onClick={() => toggleSection('userStories')}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Lightbulb size={20} color="#eab308" /> User Stories
                </h3>
                {expandedSections.userStories ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
              </div>
              {expandedSections.userStories && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {doc.userStories.map((story, i) => (
                    <div key={i} className="hover-lift" style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, flex: 1 }}>
                          <strong>As a</strong> {story.role}, <strong>I want to</strong> {story.action}, <strong>so that</strong> {story.benefit}
                        </span>
                        {story.priority && <span style={{ fontSize: 12, background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 99, fontWeight: 700, flexShrink: 0 }}>{story.priority}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

                    {/* Risk Register */}
          {activeTab === 'risks' && doc.riskRegister?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} color="#dc2626" /> Risk Register
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={14} /> Showing up to the top 3 most critical risks per category to prioritize high-impact items.
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={`filter-btn ${riskFilter === 'all' ? 'active' : ''}`} onClick={() => setRiskFilter('all')}>All</button>
                  <button className={`filter-btn ${riskFilter === 'high' ? 'active' : ''}`} onClick={() => setRiskFilter('high')}>High / Critical</button>
                  <button className={`filter-btn ${riskFilter === 'medium' ? 'active' : ''}`} onClick={() => setRiskFilter('medium')}>Medium</button>
                  <button className={`filter-btn ${riskFilter === 'low' ? 'active' : ''}`} onClick={() => setRiskFilter('low')}>Low</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <table className="data-table" style={{ width: '100%', minWidth: 800, margin: 0, border: 'none' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>ID</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Prob</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Impact</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Severity</th>
                      <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>Mitigation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.riskRegister.filter(r => riskFilter === 'all' || (riskFilter === 'high' && ['high', 'critical'].includes(r.severity?.toLowerCase())) || r.severity?.toLowerCase() === riskFilter).map((risk, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                        <td style={{ padding: '16px', fontWeight: 700, color: '#64748b' }}>{risk.id || `R${i+1}`}</td>
                        <td style={{ padding: '16px', minWidth: 200, fontSize: 14 }}>{risk.description}</td>
                        <td style={{ padding: '16px', fontSize: 14, textTransform: 'capitalize' }}>{risk.category}</td>
                        <td style={{ padding: '16px', fontSize: 14 }}>{risk.probability}</td>
                        <td style={{ padding: '16px', fontSize: 14 }}>{risk.impact}</td>
                        <td style={{ padding: '16px' }}><span className={`risk-badge ${risk.severity}`}>{risk.severity}</span></td>
                        <td style={{ padding: '16px', minWidth: 200, fontSize: 13, color: '#475569' }}>{risk.mitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

                    {/* Missing Documentation & Traceability */}
          {activeTab === 'scope' && doc.missingDocs?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileWarning size={20} color="#f97316" /> Missing Documentation
              </h3>
              <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doc.missingDocs.map((item, i) => (
                  <li key={i} style={{ fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
                    {typeof item === 'string' ? item : (
                      <>
                        <strong style={{ color: '#1e293b' }}>{item.document_type}:</strong> {item.reason}
                        {item.confidence && <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({item.confidence}% confidence)</span>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

                    {/* Traceability Gaps */}
          {activeTab === 'scope' && doc.traceability?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: expandedSections.traceGaps ? 20 : 0 }} onClick={() => toggleSection('traceGaps')}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Search size={20} color="#8b5cf6" /> Traceability Gaps
                </h3>
                {expandedSections.traceGaps ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
              </div>
              {expandedSections.traceGaps && (
                <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {doc.traceability.map((gap, i) => (
                    <li key={i} style={{ fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
                      {typeof gap === 'string' ? gap : (
                        <>
                          <strong style={{ color: '#1e293b' }}>{gap.requirement}</strong> is missing <strong style={{ color: '#8b5cf6' }}>{gap.missing_link}</strong>.
                          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{gap.reasoning}</div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

                    {/* Meeting Minutes & Decisions */}
          {activeTab === 'execution' && (doc.meetingMinutes || doc.decisions?.length > 0) && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} color="#06b6d4" /> Meeting Minutes & Decisions
              </h3>
              {doc.meetingMinutes && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Summary</h4>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#475569' }}>{doc.meetingMinutes}</p>
                </div>
              )}
              {doc.decisions?.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Key Decisions</h4>
                  <ul style={{ margin: 0, padding: '0 0 0 24px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, color: '#475569' }}>
                    {doc.decisions.map((decision, i) => <li key={i}>{decision}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

                    {/* Action Items */}
          {activeTab === 'execution' && doc.actionItems?.length > 0 && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckSquare size={20} color="#10b981" /> Action Items
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doc.actionItems.map((item, i) => {
                  const isDone = completedTasks.has(i);
                  return (
                  <div key={i} className="hover-lift" style={{ padding: '16px', border: '1px solid', borderColor: isDone ? '#10b981' : '#e2e8f0', borderRadius: '12px', background: isDone ? '#ecfdf5' : '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s', opacity: isDone ? 0.7 : 1 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <button onClick={() => toggleTask(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
                        {isDone ? <CheckCircle size={20} color="#10b981" /> : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #cbd5e1' }} />}
                      </button>
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#1e293b', textDecoration: isDone ? 'line-through' : 'none' }}>{item.task}</p>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b' }}>
                          <span><strong>Owner:</strong> {item.owner}</span>
                          <span><strong>Due:</strong> {item.deadline}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

                    {/* Sprint Summary */}
          {activeTab === 'execution' && doc.sprintSummary && (
            <div className="glass-panel hover-lift" style={{ padding: 32 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={20} color="#ec4899" /> Sprint Summary
              </h3>
              {(() => {
                let sData = doc.sprintSummary;
                try {
                  if (typeof sData === 'string') sData = JSON.parse(sData);
                } catch (e) {}

                if (typeof sData === 'string') {
                  return <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#475569' }}>{sData}</p>;
                }

                if (sData.status === "Sprint artifacts not detected.") {
                  return <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#94a3b8', fontStyle: 'italic' }}>Sprint artifacts not detected in this document.</p>;
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {sData.sprint_goals?.length > 0 && (
                      <div>
                        <strong style={{ fontSize: 14, color: '#1e293b' }}>Sprint Goals</strong>
                        <ul style={{ margin: '4px 0 0 24px', padding: 0, fontSize: 14, color: '#475569' }}>
                          {sData.sprint_goals.map((g, i) => <li key={i}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                    {sData.velocity && sData.velocity !== "Unknown" && (
                      <div><strong style={{ fontSize: 14, color: '#1e293b' }}>Velocity:</strong> <span style={{ fontSize: 14, color: '#475569' }}>{sData.velocity}</span></div>
                    )}
                    {sData.risks?.length > 0 && (
                      <div>
                        <strong style={{ fontSize: 14, color: '#1e293b' }}>Sprint Risks</strong>
                        <ul style={{ margin: '4px 0 0 24px', padding: 0, fontSize: 14, color: '#475569' }}>
                          {sData.risks.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskReport;
