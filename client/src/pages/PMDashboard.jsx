import React, { useState, useEffect } from 'react';
import { Users, Activity, Target, AlertTriangle, ArrowRight, Zap, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function PMDashboard() {
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({ activeProjects: 0, avgHealth: 0, criticalRisksCount: 0, teamMembersCount: 0 });
  const [loading, setLoading] = useState(true);
  const [inviteModal, setInviteModal] = useState({
    isOpen: false,
    projectId: null,
    step: 'input', // input, generating, success, error
    email: '',
    role: 'developer',
    link: '',
    error: ''
  });
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

  const openInviteModal = (projectId) => {
    setInviteModal({
      isOpen: true,
      projectId,
      step: 'input',
      email: '',
      role: 'developer',
      link: '',
      error: ''
    });
  };

  const submitInvite = async () => {
    if (!inviteModal.email) return;
    setInviteModal(prev => ({ ...prev, step: 'generating' }));
    
    try {
      const res = await api.post('/teams/invite', { 
        projectId: inviteModal.projectId, 
        email: inviteModal.email, 
        role: inviteModal.role 
      });
      const inviteLink = `${window.location.origin}${res.data.inviteLink}`;
      setInviteModal(prev => ({ ...prev, step: 'success', link: inviteLink }));
    } catch (error) {
      setInviteModal(prev => ({ 
        ...prev, 
        step: 'error', 
        error: error.response?.data?.error || error.message 
      }));
    }
  };

  if (loading) return <div className="p-8 text-slate-500 fade-in">Loading Dashboard Environments...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 fade-in">
      
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden p-8 lg:p-12 shadow-sm border border-indigo-100 bg-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50 rounded-full blur-3xl opacity-60 -translate-y-20 translate-x-20"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple-50 rounded-full blur-3xl opacity-60 translate-y-20 -translate-x-10"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold tracking-wide uppercase mb-4">
              <Zap size={14} className="text-indigo-500" /> Executive View
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              Welcome back, <span className="text-gradient">Manager</span>
            </h1>
            <p className="text-slate-500 text-lg max-w-xl">
              Oversee your AI risk analysis pipelines, coordinate your development teams, and track enterprise compliance in real-time.
            </p>
          </div>
          <button 
            onClick={() => navigate('/projects')}
            className="btn-primary whitespace-nowrap shadow-lg shadow-indigo-500/30"
          >
            + Initialize New Project
          </button>
        </div>
      </div>

      {/* Dynamic Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Target size={24} />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.activeProjects}</p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Active Projects</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Activity size={24} />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Real-time</span>
          </div>
          <div className="relative z-10">
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.avgHealth}<span className="text-2xl text-slate-400">/100</span></p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Avg Health Score</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
              <AlertTriangle size={24} />
            </div>
            {stats.criticalRisksCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md">
                <span className="status-dot processing !bg-rose-500"></span> Requires Attention
              </span>
            )}
          </div>
          <div className="relative z-10">
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.criticalRisksCount}</p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Critical Risks</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <Users size={24} />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.teamMembersCount}</p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Team Members</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-panel rounded-2xl p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900">Project Command Center</h2>
            <button onClick={() => navigate('/projects')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              View All <ArrowRight size={16} />
            </button>
          </div>
          <div className="space-y-4">
            {projects.map(p => (
              <div key={p.id} className="p-5 border border-slate-100 rounded-xl bg-white hover:border-indigo-200 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group shadow-sm">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{p.name}</h3>
                  <p className="text-sm text-slate-500 line-clamp-1">{p.description}</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => openInviteModal(p.id)}
                    className="flex-1 sm:flex-none text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-lg border border-slate-200 transition"
                  >
                    Invite
                  </button>
                  <button 
                    onClick={() => navigate(`/upload?project=${p.id}`)}
                    className="flex-1 sm:flex-none text-sm font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    Hub <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-500 text-sm mb-4">No active projects found in your command center.</p>
                <button onClick={() => navigate('/projects')} className="btn-primary text-sm py-2">Create First Project</button>
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
          {/* Subtle animated background for the activity feed */}
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-slate-50/50 to-transparent -z-10"></div>
          
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
            Live Organization Activity
          </h2>
          
          <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 mt-4">
            
            <div className="relative">
              <div className="absolute -left-[31px] bg-white p-1 rounded-full border border-slate-100">
                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></div>
              </div>
              <p className="text-sm text-slate-900 font-medium">New document uploaded to <span className="text-indigo-600 font-bold">Q4 Review</span></p>
              <p className="text-xs text-slate-500 mt-1">Just now • Auto-analysis initiated</p>
            </div>

            <div className="relative">
              <div className="absolute -left-[31px] bg-white p-1 rounded-full border border-slate-100">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
              </div>
              <p className="text-sm text-slate-900 font-medium">AI Risk Assessment complete for <span className="font-bold">Project Alpha</span></p>
              <p className="text-xs text-slate-500 mt-1">2 hours ago • Health Score: 92/100</p>
            </div>

            <div className="relative">
              <div className="absolute -left-[31px] bg-white p-1 rounded-full border border-slate-100">
                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full"></div>
              </div>
              <p className="text-sm text-slate-900 font-medium">Traceability gap detected in <span className="font-bold">Backend API SRS</span></p>
              <p className="text-xs text-slate-500 mt-1">Yesterday • Assigned to Developer Team</p>
            </div>

          </div>
          
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs text-center text-slate-400 italic">Full live WebSocket integration streaming coming soon.</p>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {inviteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden relative">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Invite Team Member</h3>
              <button onClick={() => setInviteModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            
            <div className="p-6">
              {inviteModal.step === 'input' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input 
                      type="email" 
                      value={inviteModal.email}
                      onChange={e => setInviteModal(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="colleague@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <select 
                      value={inviteModal.role}
                      onChange={e => setInviteModal(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="developer">Developer</option>
                      <option value="auditor">Auditor</option>
                      <option value="pm">Project Manager</option>
                    </select>
                  </div>
                  <button 
                    onClick={submitInvite}
                    disabled={!inviteModal.email}
                    className="w-full btn-primary mt-2 flex justify-center py-2.5 disabled:opacity-50"
                  >
                    Generate Invite Link
                  </button>
                </div>
              )}

              {inviteModal.step === 'generating' && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-slate-600 font-medium">Generating secure invite link...</p>
                </div>
              )}

              {inviteModal.step === 'success' && (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle size={24} />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">Invite Generated!</h4>
                  <p className="text-sm text-slate-500 mb-4">Copy the link below and securely share it with your team member.</p>
                  
                  <div className="flex w-full gap-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={inviteModal.link}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(inviteModal.link);
                        // Optional: show a quick copied toast
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition"
                    >
                      Copy
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => setInviteModal(prev => ({ ...prev, isOpen: false }))}
                    className="mt-6 text-sm text-slate-500 font-medium hover:text-slate-800"
                  >
                    Close
                  </button>
                </div>
              )}

              {inviteModal.step === 'error' && (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle size={24} />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">Generation Failed</h4>
                  <p className="text-sm text-rose-600 mb-6">{inviteModal.error}</p>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setInviteModal(prev => ({ ...prev, step: 'input' }))}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition"
                    >
                      Try Again
                    </button>
                    <button 
                      onClick={() => setInviteModal(prev => ({ ...prev, isOpen: false }))}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
