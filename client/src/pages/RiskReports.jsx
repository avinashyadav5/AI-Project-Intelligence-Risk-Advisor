import React, { useState, useEffect } from 'react';
import { getProjectFiles, getProjects } from '../services/api';
import { ShieldAlert, Eye, FolderKanban, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const RiskReports = () => {
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const projRes = await getProjects();
        const projs = projRes.data;
        // Fetch docs for all projects in parallel
        const docResults = await Promise.all(projs.map(p => getProjectFiles(p.id)));
        const docs = docResults.flatMap((r, i) =>
          r.data.map(d => ({ ...d, projectName: projs[i].name }))
        );
        setAllDocs(docs.filter(d => d.status === 'Analyzed'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#94a3b8', padding: 60, fontSize: 14 }}>
      <div className="spinner" /> Loading reports...
    </div>
  );

  return (
    <div className="fade-in max-w-7xl mx-auto space-y-8">
      
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden p-8 lg:p-12 shadow-sm border border-slate-200 bg-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-50 rounded-full blur-[80px] opacity-60 -translate-y-10 translate-x-10"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-full text-xs font-bold tracking-wider uppercase mb-4 shadow-sm">
              <BarChart2 size={14} className="text-rose-600" /> Portfolio Reports
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              Risk Reports
            </h1>
            <p className="text-slate-600 text-lg max-w-xl font-medium">
              Review AI-generated compliance and risk assessments across all project documents.
            </p>
          </div>
        </div>
      </div>

      {allDocs.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
          <ShieldAlert size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium text-lg mb-4">No analyzed documents yet.</p>
          <Link to="/upload" className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-md shadow-indigo-500/20">
            Upload a Document
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allDocs.map((doc, i) => {
            const score = doc.riskScore ?? 0;
            const color = score >= 70 ? '#dc2626' : score >= 45 ? '#ef4444' : score >= 20 ? '#f59e0b' : '#10b981';
            const bgGradient = score >= 70 ? 'from-rose-50 to-white border-rose-100' : score >= 45 ? 'from-orange-50 to-white border-orange-100' : 'from-emerald-50 to-white border-emerald-100';

            return (
              <div key={doc.id} className={`glass-panel p-6 rounded-2xl hover-lift border flex flex-col justify-between h-full bg-gradient-to-b ${bgGradient}`} style={{ animationDelay: `${i * 0.05}s` }}>
                
                <div>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-slate-900 truncate" title={doc.originalName}>
                        {doc.originalName}
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                        <FolderKanban size={14} className="text-slate-400" /> <span className="truncate">{doc.projectName}</span>
                      </p>
                    </div>
                    <span className={`risk-badge ${doc.riskLevel} shrink-0`}>{doc.riskLevel}</span>
                  </div>

                  {/* Risk score bar */}
                  <div className="bg-white p-4 rounded-xl border border-slate-100 mb-4">
                    <div className="flex justify-between text-xs font-semibold mb-2">
                      <span className="text-slate-500 uppercase tracking-wider">Risk Score</span>
                      <span style={{ color }}>{score}/100</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${score}%`, background: color }} />
                    </div>
                  </div>

                  {/* Summary snippet */}
                  {doc.summary && (
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 mb-6">
                      {doc.summary}
                    </p>
                  )}
                </div>

                <Link
                  to={`/report/${doc.id}`}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-lg font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <Eye size={16} /> View Full Report
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RiskReports;
