import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Zap, Target, Activity, ArrowRight, ShieldAlert, FileText } from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen relative overflow-hidden font-sans text-main">
      {/* Background blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[40%] right-[-10%] w-[40%] h-[40%] bg-info/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[30%] h-[30%] bg-accent/20 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Navigation */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-info flex flex-shrink-0 items-center justify-center shadow-lg shadow-primary/30">
            <Zap size={22} className="text-white" />
          </div>
          <span className="text-xl font-black text-main tracking-tight hidden md:block">Development of AI Powered Health Monitoring & Risk Analysis Platform</span>
          <span className="text-lg font-black text-main tracking-tight md:hidden">AI Risk Platform</span>
        </div>
        <div className="flex gap-4 items-center flex-shrink-0">
          <Link to="/login" className="px-5 py-2.5 text-sm font-bold text-muted hover:text-primary transition-colors">Log in</Link>
          <Link to="/register" className="btn-primary px-6 py-2.5 rounded-xl text-sm shadow-lg shadow-primary/25">Get Started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-32 flex flex-col items-center text-center fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-light border border-primary/20 text-primary rounded-full text-xs font-bold tracking-wide uppercase mb-8 shadow-sm backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          AI-Powered Enterprise Risk Management
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-main tracking-tight mb-8 leading-[1.1] max-w-4xl">
          Don't let hidden risks <span className="text-gradient">derail your project.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted max-w-2xl mb-12 leading-relaxed font-medium">
          Upload your PRDs, architectural docs, and contracts. Our multi-agent AI pipeline instantly extracts dependencies, identifies critical risks, and generates a unified traceability matrix.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/register" className="btn-primary px-8 py-4 rounded-xl text-base shadow-xl shadow-primary/30 flex items-center gap-2 justify-center hover-lift">
            Start Free Trial <ArrowRight size={18} />
          </Link>
          <a href="#features" className="px-8 py-4 bg-surface text-main border border-border rounded-xl font-bold hover:bg-surface-hover transition-all shadow-sm flex justify-center hover-lift">
            Explore Features
          </a>
        </div>

        {/* Hero Dashboard Preview */}
        <div className="mt-24 w-full max-w-5xl glass-panel rounded-2xl p-2 md:p-3 shadow-2xl border border-white/60 relative hover-lift" style={{ transform: 'perspective(1200px) rotateX(4deg)' }}>
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent rounded-2xl z-10 pointer-events-none"></div>
          
          <div className="bg-secondary rounded-xl overflow-hidden shadow-inner flex flex-col border border-secondary-hover">
            {/* Fake browser bar */}
            <div className="h-10 bg-black/40 border-b border-white/5 flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-danger"></div>
                <div className="w-3 h-3 rounded-full bg-warning"></div>
                <div className="w-3 h-3 rounded-full bg-success"></div>
              </div>
              <div className="mx-auto flex items-center justify-center h-6 w-64 bg-black/30 rounded-md text-[10px] text-white/40 font-medium tracking-wide">
                <Shield size={10} className="mr-2" /> app.riskadvisor.ai
              </div>
            </div>
            
            {/* Realistic App UI */}
            <div className="flex h-[400px] text-left opacity-95">
              {/* Sidebar */}
              <div className="hidden md:flex w-48 bg-secondary border-r border-white/5 p-4 flex-col gap-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-gradient-to-br from-primary to-info flex flex-shrink-0 items-center justify-center"><Zap size={12} className="text-white" /></div>
                  <span className="text-white text-xs font-bold truncate">Development of AI Powered Health Monitoring</span>
                </div>
                {['Dashboard', 'Projects', 'Upload', 'Reports', 'Chat'].map((item, i) => (
                  <div key={item} className={`text-[11px] font-medium px-3 py-2 rounded-md ${i === 0 ? 'bg-primary/20 text-primary-light' : 'text-white/40'}`}>
                    {item}
                  </div>
                ))}
              </div>
              
              {/* Main Content */}
              <div className="flex-1 bg-secondary-hover p-6 flex flex-col gap-6 overflow-hidden">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-white text-lg font-bold">Command Center</h3>
                    <p className="text-white/40 text-xs mt-1">Real-time enterprise overview</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="px-3 py-1.5 rounded bg-black/20 text-white/60 text-[10px] font-bold">Last sync: 2m ago</div>
                    <div className="px-3 py-1.5 rounded bg-primary text-white text-[10px] font-bold">+ New Project</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Stat Cards */}
                  <div className="bg-secondary border border-white/5 rounded-lg p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="w-8 h-8 rounded bg-success/20 flex items-center justify-center"><Activity size={14} className="text-success" /></div>
                      <span className="text-success text-[10px] font-bold px-2 py-1 bg-success/10 rounded">92/100</span>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-white">A</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Avg Health Score</div>
                    </div>
                  </div>
                  
                  <div className="bg-secondary border border-white/5 rounded-lg p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="w-8 h-8 rounded bg-danger/20 flex items-center justify-center"><ShieldAlert size={14} className="text-danger" /></div>
                      <span className="text-danger text-[10px] font-bold px-2 py-1 bg-danger/10 rounded">+3 Today</span>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-white">12</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Critical Risks</div>
                    </div>
                  </div>
                  
                  <div className="bg-secondary border border-white/5 rounded-lg p-4 hidden sm:flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center"><FileText size={14} className="text-primary-light" /></div>
                    </div>
                    <div className="mt-4 relative z-10">
                      <div className="text-2xl font-black text-white">8,402</div>
                      <div className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Pages Analyzed</div>
                    </div>
                  </div>
                </div>
                
                {/* List View */}
                <div className="flex-1 bg-secondary border border-white/5 rounded-lg p-4">
                  <div className="text-white/60 text-xs font-bold mb-4 border-b border-white/5 pb-2">Recent Risk Reports</div>
                  {[
                    { name: 'Q4 API Migration Strategy.pdf', risk: 'High', color: 'text-danger', bg: 'bg-danger/10' },
                    { name: 'Frontend Refactor PRD.docx', risk: 'Low', color: 'text-success', bg: 'bg-success/10' },
                    { name: 'Database Scaling Plan v2.pdf', risk: 'Medium', color: 'text-warning', bg: 'bg-warning/10' }
                  ].map((doc, i) => (
                    <div key={i} className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <FileText size={14} className="text-white/40" />
                        <span className="text-white/80 text-[11px] font-medium">{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-1.5 bg-black/30 rounded-full overflow-hidden">
                          <div className={`h-full ${doc.bg.replace('/10', '')}`} style={{ width: doc.risk === 'High' ? '80%' : doc.risk === 'Medium' ? '50%' : '20%' }}></div>
                        </div>
                        <span className={`${doc.color} ${doc.bg} px-2 py-0.5 rounded text-[9px] font-bold w-12 text-center`}>{doc.risk}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* How it Works / Workflow Section */}
      <section className="py-24 bg-background text-main relative z-10 overflow-hidden border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black mb-4">How Development of AI Powered Health Monitoring & Risk Analysis Platform Works</h2>
            <p className="text-muted text-lg">From raw unstructured documents to actionable insights in seconds.</p>
          </div>

          <div className="flex flex-col gap-24">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1 md:pr-12 text-center md:text-left">
                <div className="w-12 h-12 bg-primary-light text-primary rounded-xl flex items-center justify-center text-xl font-black mb-6 mx-auto md:mx-0 shadow-sm border border-primary/20">1</div>
                <h3 className="text-2xl font-bold mb-4">Upload Your Documents</h3>
                <p className="text-muted text-lg leading-relaxed">
                  Simply drag and drop your PRDs, architectural diagrams, contracts, or spreadsheets. Our system securely encrypts and ingests any standard document format instantly.
                </p>
              </div>
              <div className="flex-1 w-full relative group">
                <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-2xl group-hover:bg-primary/20 transition-all duration-700"></div>
                <img src="/images/step1.jpg" alt="Document Upload Scanning" className="relative w-full rounded-2xl shadow-xl border border-border object-cover aspect-video hover:scale-[1.02] transition-transform duration-500" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row-reverse items-center gap-12">
              <div className="flex-1 md:pl-12 text-center md:text-left">
                <div className="w-12 h-12 bg-accent-light text-accent rounded-xl flex items-center justify-center text-xl font-black mb-6 mx-auto md:mx-0 shadow-sm border border-accent/20">2</div>
                <h3 className="text-2xl font-bold mb-4">Multi-Agent AI Analysis</h3>
                <p className="text-muted text-lg leading-relaxed">
                  Four specialized autonomous AI agents (Risk, Scope, Docs, Health) analyze your documents in parallel. They extract dependencies, identify edge cases, and cross-reference against industry standards.
                </p>
              </div>
              <div className="flex-1 w-full relative group">
                <div className="absolute inset-0 bg-accent/10 rounded-2xl blur-2xl group-hover:bg-accent/20 transition-all duration-700"></div>
                <img src="/images/step2.jpg" alt="AI Neural Network Processing" className="relative w-full rounded-2xl shadow-xl border border-border object-cover aspect-video hover:scale-[1.02] transition-transform duration-500" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1 md:pr-12 text-center md:text-left">
                <div className="w-12 h-12 bg-success-bg text-success rounded-xl flex items-center justify-center text-xl font-black mb-6 mx-auto md:mx-0 shadow-sm border border-success/20">3</div>
                <h3 className="text-2xl font-bold mb-4">Get Actionable Insights</h3>
                <p className="text-muted text-lg leading-relaxed">
                  Receive a unified deterministic health grade, an auto-generated Risk Register, and ready-to-use Agile User Stories. Everything is centralized in a beautiful, actionable dashboard.
                </p>
              </div>
              <div className="flex-1 w-full relative group">
                <div className="absolute inset-0 bg-success/10 rounded-2xl blur-2xl group-hover:bg-success/20 transition-all duration-700"></div>
                <img src="/images/step3.jpg" alt="Actionable Dashboard and Insights" className="relative w-full rounded-2xl shadow-xl border border-border object-cover aspect-video hover:scale-[1.02] transition-transform duration-500" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 border-y border-border relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-black text-main mb-4">Multi-Agent Intelligence</h2>
            <p className="text-muted text-lg">Four specialized AI agents analyze your documents simultaneously to provide a 360-degree risk assessment.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: ShieldAlert, color: 'text-danger', bg: 'bg-danger-bg', title: 'Risk Analyst', desc: 'Identifies budget, timeline, and operational risks instantly.' },
              { icon: Target, color: 'text-info', bg: 'bg-info-bg', title: 'Scope Planner', desc: 'Extracts objectives, boundaries, and critical deliverables.' },
              { icon: FileText, color: 'text-primary', bg: 'bg-primary-light', title: 'Doc Generator', desc: 'Converts unstructured text into Agile User Stories automatically.' },
              { icon: Activity, color: 'text-success', bg: 'bg-success-bg', title: 'Health Scorer', desc: 'Calculates a deterministic project health grade based on findings.' }
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-2xl border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all hover-lift bg-surface">
                <div className={`w-14 h-14 ${f.bg} rounded-xl flex items-center justify-center mb-6`}>
                  <f.icon size={28} className={f.color} />
                </div>
                <h3 className="text-xl font-bold text-main mb-3">{f.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-12 bg-background text-center relative z-10 border-t border-border">
        <div className="flex items-center justify-center gap-2 mb-4 opacity-50 hover:opacity-100 transition-opacity">
          <Zap size={20} className="text-primary" />
          <span className="text-lg font-bold text-main">Development of AI Powered Health Monitoring & Risk Analysis Platform</span>
        </div>
        <p className="text-muted text-sm">© 2026 Development of AI Powered Health Monitoring & Risk Analysis Platform Enterprise. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Landing;
