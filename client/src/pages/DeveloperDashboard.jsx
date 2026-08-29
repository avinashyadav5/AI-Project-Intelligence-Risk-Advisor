import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, MessageSquare, Terminal, Plus, Code, ArrowRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function DeveloperDashboard() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({ myTasks: 0, deadlines: 0, tasks: [] });
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({ projectId: '', name: '', description: '' });
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
      window.location.reload(); // Refresh fully
    } catch (error) {
      alert("Failed to join project: " + (error.response?.data?.error || error.message));
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      await api.patch(`/milestones/${taskId}/progress`, { status: newStatus });
      setStats(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
      }));
    } catch (error) {
      console.error("Failed to update status", error);
      alert("Failed to update task status.");
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.projectId || !newTask.name) {
      alert("Please select a project and enter a task name.");
      return;
    }
    try {
      const res = await api.post('/milestones', newTask);
      setStats(prev => ({
        ...prev,
        myTasks: prev.myTasks + 1,
        tasks: [res.data, ...prev.tasks]
      }));
      setShowTaskModal(false);
      setNewTask({ projectId: '', name: '', description: '' });
    } catch (error) {
      alert("Failed to create task: " + (error.response?.data?.error || error.message));
    }
  };

  if (loading) return <div className="p-8 text-slate-500 fade-in">Loading Dev Environment...</div>;

  const todoTasks = stats.tasks.filter(t => t.status === 'pending');
  const inProgressTasks = stats.tasks.filter(t => t.status === 'in_progress');
  const completedTasks = stats.tasks.filter(t => t.status === 'completed');

  return (
    <div className="max-w-7xl mx-auto space-y-8 fade-in">
      
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden p-8 lg:p-12 shadow-sm border border-slate-800 bg-slate-900 text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-[100px] opacity-20 -translate-y-20 translate-x-20"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500 rounded-full blur-[100px] opacity-20 translate-y-20 -translate-x-10"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/50 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-mono mb-4">
              <Code size={14} /> Dev Environment
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Developer</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl">
              Access AI-generated API documentation, track your active milestones, and chat with the repository oracle.
            </p>
          </div>
          <button 
            onClick={handleJoin}
            className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-lg font-bold hover:bg-slate-100 transition shadow-lg shadow-white/10 hover-lift"
          >
            <Plus size={18} />
            Join via Invite Link
          </button>
        </div>
      </div>

      {/* Dynamic Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <CheckCircle size={24} />
            </div>
            {stats.myTasks > 0 && <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">Active</span>}
          </div>
          <div>
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.myTasks}</p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">My Active Tasks</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between hover-lift border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <Clock size={24} />
            </div>
            {stats.deadlines > 0 && <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md">This Week</span>}
          </div>
          <div>
            <p className="text-4xl font-black text-slate-900 mb-1">{stats.deadlines}</p>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Upcoming Deadlines</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Projects Column */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-1 border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Assigned Projects</h2>
          <div className="space-y-4">
            {projects.map(p => (
              <div key={p.id} className="p-4 border border-slate-200 rounded-xl bg-white hover:border-emerald-300 transition-colors group shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors mb-1">{p.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                  <button 
                    onClick={() => navigate(`/upload?project=${p.id}`)}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg transition"
                  >
                    Open Hub <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <p className="text-slate-500 text-xs mb-3">You have not been assigned to any projects yet.</p>
                <button onClick={handleJoin} className="btn-secondary text-xs py-1.5">Join a Project</button>
              </div>
            )}
          </div>
        </div>

        {/* Agile Kanban Board */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold text-slate-900">Agile Sprint Board</h2>
              <button 
                onClick={() => setShowTaskModal(true)} 
                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs py-1.5 px-3 rounded-lg transition"
              >
                + New Task
              </button>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200">To Do ({todoTasks.length})</span>
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg border border-blue-200">In Progress ({inProgressTasks.length})</span>
              <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg border border-emerald-200">Done ({completedTasks.length})</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* To Do */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 min-h-[300px]">
              <h3 className="text-sm font-bold text-slate-600 mb-3 uppercase tracking-wider">To Do</h3>
              <div className="space-y-3">
                {todoTasks.map(t => (
                  <div key={t.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-slate-300">
                    <h4 className="font-semibold text-slate-800 text-sm mb-1">{t.name}</h4>
                    <p className="text-xs text-slate-500 mb-3">{t.description}</p>
                    <button onClick={() => updateTaskStatus(t.id, 'in_progress')} className="w-full text-xs font-bold bg-blue-50 text-blue-600 py-1.5 rounded hover:bg-blue-100 transition">
                      Start Task
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* In Progress */}
            <div className="bg-blue-50/30 rounded-xl p-3 border border-blue-100 min-h-[300px]">
              <h3 className="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wider">In Progress</h3>
              <div className="space-y-3">
                {inProgressTasks.map(t => (
                  <div key={t.id} className="bg-white p-3 rounded-lg shadow-sm border border-blue-200 hover:border-blue-300">
                    <h4 className="font-semibold text-slate-800 text-sm mb-1">{t.name}</h4>
                    <p className="text-xs text-slate-500 mb-3">{t.description}</p>
                    <button onClick={() => updateTaskStatus(t.id, 'completed')} className="w-full text-xs font-bold bg-emerald-50 text-emerald-600 py-1.5 rounded hover:bg-emerald-100 transition">
                      Complete Task
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Done */}
            <div className="bg-emerald-50/30 rounded-xl p-3 border border-emerald-100 min-h-[300px]">
              <h3 className="text-sm font-bold text-emerald-600 mb-3 uppercase tracking-wider">Done</h3>
              <div className="space-y-3">
                {completedTasks.map(t => (
                  <div key={t.id} className="bg-white p-3 rounded-lg shadow-sm border border-emerald-200 opacity-60 hover:opacity-100 transition-opacity">
                    <h4 className="font-semibold text-slate-800 text-sm mb-1 line-through">{t.name}</h4>
                    <p className="text-xs text-slate-500 mb-3">{t.description}</p>
                    <button onClick={() => updateTaskStatus(t.id, 'pending')} className="w-full text-xs font-bold bg-slate-50 text-slate-600 py-1.5 rounded hover:bg-slate-100 transition">
                      Reopen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Create Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden relative">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Create New Sprint Task</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                <select 
                  value={newTask.projectId}
                  onChange={e => setNewTask(prev => ({ ...prev, projectId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="" disabled>Select a project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Task Name</label>
                <input 
                  type="text" 
                  value={newTask.name}
                  onChange={e => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Update authentication logic"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea 
                  value={newTask.description}
                  onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                  placeholder="Additional context for this task..."
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateTask}
                  disabled={!newTask.projectId || !newTask.name}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium transition disabled:opacity-50"
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
