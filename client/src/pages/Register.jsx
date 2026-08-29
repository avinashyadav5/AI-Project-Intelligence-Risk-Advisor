import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

const Register = () => {
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'developer' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register(formData);
      const intended = sessionStorage.getItem('redirectAfterLogin');
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(intended || '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-50 relative overflow-hidden fade-in">
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200 rounded-full blur-[120px] opacity-60"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200 rounded-full blur-[120px] opacity-60"></div>

      <div className="glass-panel w-full max-w-[420px] p-8 md:p-10 rounded-3xl shadow-xl border border-white z-10 relative">
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">AI Project Intelligence & Risk Advisor</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Create a new account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Name</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Email Address</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Password</label>
            <input 
              type="password" 
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Role</label>
            <select 
              value={formData.role} 
              onChange={e => setFormData({...formData, role: e.target.value})} 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
            >
              <option value="developer">Developer</option>
              <option value="pm">Project Manager</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-sm font-medium flex items-center gap-2 mt-2">
              <Shield size={16} className="shrink-0" /> {error}
            </div>
          )}
          
          <button className="w-full btn-primary py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-500/25 hover-lift mt-4" type="submit" disabled={loading}>
            {loading ? <span className="flex items-center justify-center gap-2"><div className="spinner w-4 h-4 border-2 border-t-white" /> Registering...</span> : 'Register'}
          </button>
        </form>

        <p className="text-center mt-8 text-sm font-medium text-slate-500">
          Already have an account? <Link to="/login" className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
