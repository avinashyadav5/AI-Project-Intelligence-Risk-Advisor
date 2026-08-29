import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileSearch, History, DownloadCloud, Plus, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function AuditorDashboard() {
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({ compliantProjects: 0, missingDocsCount: 0, traceabilityGaps: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [projectsRes, statsRes] = await Promise.all([
          api.get('/projects'),
          api.get('/dashboard/stats')
        ]);
        setProjects(projectsRes.data);
        setStats(statsRes.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  const handleJoin = async () => {
    const tokenInput = window.prompt("Paste your invite link or token to join a project:");
    if (!tokenInput) return;

    const token = tokenInput.includes('token=') ? new URL(tokenInput).searchParams.get('token') : tokenInput;

    try {
      await api.post('/teams/join', { token });
      alert("Successfully joined the project!");
      window.location.reload(); // Refresh the list
    } catch (error) {
      alert("Failed to join project: " + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="p-8 text-slate-500 fade-in">Loading Compliance Portal...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 fade-in">
      
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden p-8 lg:p-12 shadow-sm border border-amber-200 bg-amber-50">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-300 rounded-full blur-[80px] opacity-20 -translate-y-10 translate-x-10"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white text-amber-700 border border-amber-200 rounded-full text-xs font-bold tracking-wider uppercase mb-4 shadow-sm">
              <ShieldCheck size={14} className="text-amber-600" /> Compliance Portal
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              Welcome back, <span className="text-amber-600">Auditor</span>
            </h1>
            <p className="text-slate-600 text-lg max-w-xl font-medium">
              Monitor traceability gaps, verify compliance against risk frameworks, and review automated audit logs.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleJoin}
              className="px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-lg font-bold hover:bg-slate-50 transition shadow-sm flex items-center gap-2"
            >
              <Plus size={18} /> Join
            </button>
            <button 
              onClick={() => navigate('/reports')}
              className="px-5 py-2.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition shadow-md shadow-amber-600/20 flex items-center gap-2 hover-lift"
            >
              <DownloadCloud size={18} /> Run Audit Report
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl flex items-center justify-between shadow-sm border-l-4 border-l-emerald-500 border-y border-r border-slate-200 hover-lift">
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Compliant Projects</p>
            <p className="text-4xl font-black text-slate-900">{stats.compliantProjects}</p>
          </div>
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={32} />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl flex items-center justify-between shadow-sm border-l-4 border-l-rose-500 border-y border-r border-slate-200 hover-lift">
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Missing Docs</p>
            <p className="text-4xl font-black text-slate-900">{stats.missingDocsCount}</p>
          </div>
          <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
            <FileSearch size={32} />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl flex items-center justify-between shadow-sm border-l-4 border-l-amber-500 border-y border-r border-slate-200 hover-lift">
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Traceability Gaps</p>
            <p className="text-4xl font-black text-slate-900">{stats.traceabilityGaps}</p>
          </div>
          <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <History size={32} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-6 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-amber-600" size={20} /> Audited Organizations
          </h2>
          <span className="text-xs font-mono bg-slate-200 text-slate-600 px-2 py-1 rounded">RESTRICTED VIEW</span>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            {projects.map(p => (
              <div key={p.id} className="p-5 border border-slate-200 rounded-xl hover:border-amber-300 hover:shadow-md transition-all flex justify-between items-center bg-white group">
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <AlertOctagon className="text-slate-400 group-hover:text-amber-500 transition-colors" size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{p.name}</h3>
                    <p className="text-sm text-slate-500">{p.description}</p>
                    <div className="mt-2 flex gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">ID: {p.id.split('-')[0]}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-50 text-amber-700 px-2 py-0.5 rounded">Compliance Pending</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => navigate('/reports')}
                  className="px-4 py-2 text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition"
                >
                  Risk Matrix
                </button>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <ShieldCheck className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500 font-medium">No projects currently assigned to your audit queue.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
