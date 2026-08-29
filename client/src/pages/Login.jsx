import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
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
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Development of AI Powered Health Monitoring & Risk Analysis Platform</h2>
          <p className="text-slate-500 text-sm font-medium mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block mb-1.5 text-sm font-bold text-slate-700">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white/50"
              placeholder="••••••••"
            />
          </div>
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-sm font-medium flex items-center gap-2">
              <Shield size={16} className="shrink-0" /> {error}
            </div>
          )}
          
          <button className="w-full btn-primary py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-500/25 hover-lift mt-2" type="submit" disabled={loading}>
            {loading ? <span className="flex items-center justify-center gap-2"><div className="spinner w-4 h-4 border-2 border-t-white" /> Authenticating...</span> : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-8 text-sm font-medium text-slate-500">
          Don't have an account? <Link to="/register" className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline">Register now</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
