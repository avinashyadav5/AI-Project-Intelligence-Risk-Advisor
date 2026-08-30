import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getProjects, uploadFile, getProjectFiles, getDocument, reanalyzeDocument, deleteDocument, errorMessage, API_BASE_URL } from '../services/api';
import DocumentGeneratorModal from '../components/DocumentGeneratorModal';
import { UploadCloud, FileText, CheckCircle, AlertCircle, RefreshCw, Eye, X, Wand2, Trash2, RotateCw } from 'lucide-react';
import ProjectChat from '../components/ProjectChat';
import ProjectIntelligence from '../components/ProjectIntelligence';
import HealthTrend from '../components/HealthTrend';
import TeamPanel from '../components/TeamPanel';
import RiskAlerts from '../components/RiskAlerts';
import TaskBoard from '../components/TaskBoard';
import { useToast } from '../context/ToastContext';

const STATUS_POLL_MS = 5000;

const UploadDocuments = () => {
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(() => {
    return searchParams.get('project') || localStorage.getItem('lastSelectedProject') || '';
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // Document Generator Modal State
  const [showGenModal, setShowGenModal] = useState(false);

  // View Text State
  const [viewTextDoc, setViewTextDoc] = useState(null);
  const [viewTextLoading, setViewTextLoading] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem('lastSelectedProject', selectedProject);
      fetchDocuments(selectedProject);
    } else {
      setDocuments([]);
    }
  }, [selectedProject]);

  // Auto-poll while any doc is Processing
  useEffect(() => {
    clearInterval(pollRef.current);
    const hasProcessing = documents.some(d => d.status === 'Processing');
    if (hasProcessing && selectedProject) {
      pollRef.current = setInterval(() => fetchDocuments(selectedProject, true), STATUS_POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [documents, selectedProject]);

  const fetchProjects = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
      const paramProject = searchParams.get('project');
      const localProject = localStorage.getItem('lastSelectedProject');
      
      // Ensure the currently selected project actually exists in the fetched list
      const currentExists = res.data.some(p => p.id === selectedProject);
      
      if (!currentExists && res.data.length > 0) {
        // If current selection is invalid, fallback to localProject if valid, else first project
        if (localProject && res.data.some(p => p.id === localProject)) {
          setSelectedProject(localProject);
        } else {
          setSelectedProject(res.data[0].id);
        }
      } else if (!paramProject && !selectedProject && res.data.length > 0) {
        if (localProject && res.data.some(p => p.id === localProject)) {
          setSelectedProject(localProject);
        } else {
          setSelectedProject(res.data[0].id);
        }
      }
    } catch (err) { console.error(err); }
  };

  const fetchDocuments = async (projectId, silent = false) => {
    if (!silent) setLoadingDocs(true);
    try {
      const res = await getProjectFiles(projectId);
      setDocuments(res.data);
    } catch (err) { console.error(err); }
    finally { if (!silent) setLoadingDocs(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); setUploadStatus(null); }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); setUploadStatus(null); }
  };

  const clearFile = () => {
    setFile(null);
    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toast = useToast();
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState('');
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(null);

  // Recovers a document whose analysis failed or was interrupted by a restart.
  const handleReanalyze = async (doc) => {
    setRowBusy(doc.id);
    setRowError('');
    try {
      await reanalyzeDocument(doc.id);
      setDocuments(prev => prev.map(d => (d.id === doc.id ? { ...d, status: 'Processing', errorMessage: null } : d)));
      toast.info('Re-analysing ' + doc.originalName + '.');
    } catch (err) {
      const msg = errorMessage(err, 'Could not restart the analysis.');
      // Free-tier Render wipes /uploads on restart — give a clear, actionable message
      const isFileMissing = msg.toLowerCase().includes('no longer on the server') ||
                            msg.toLowerCase().includes('file not found') ||
                            err?.response?.status === 404;
      setRowError(
        isFileMissing
          ? `"${doc.originalName}" was deleted when the server restarted (free tier limitation). Please re-upload the file to analyse it again.`
          : msg
      );
    } finally {
      setRowBusy(null);
    }
  };

  const handleDeleteDoc = async (doc) => {
    setRowBusy(doc.id);
    setRowError('');
    try {
      await deleteDocument(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      setConfirmDeleteDoc(null);
      toast.success('Deleted ' + doc.originalName + '.');
    } catch (err) {
      setRowError(errorMessage(err, 'Could not delete the document.'));
      setConfirmDeleteDoc(null);
    } finally {
      setRowBusy(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !selectedProject || uploading) return;
    setUploading(true);
    setUploadStatus(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', selectedProject);
    try {
      await uploadFile(fd);
      setUploadStatus({ type: 'success', message: `"${file.name}" uploaded! Groq AI analysis started...` });
      clearFile();
      fetchDocuments(selectedProject);
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed. Ensure the backend is running.';
      setUploadStatus({ type: 'error', message: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleViewText = async (docId) => {
    setViewTextLoading(true);
    try {
      const res = await getDocument(docId);
      setViewTextDoc(res.data);
    } catch (err) {
      toast.error('Could not load that file.');
    } finally {
      setViewTextLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), 2);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const processingCount = documents.filter(d => d.status === 'Processing').length;

  return (
    <div className="fade-in max-w-7xl mx-auto space-y-8">
      
      {/* Hero Section */}
      <div className="relative rounded-2xl overflow-hidden p-8 lg:p-12 shadow-sm border border-slate-200 bg-slate-900 text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full blur-[100px] opacity-20 -translate-y-20 translate-x-20"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500 rounded-full blur-[100px] opacity-20 translate-y-20 -translate-x-10"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700 text-indigo-400 rounded-full text-xs font-bold tracking-wider uppercase mb-4 shadow-sm">
              <UploadCloud size={14} className="text-indigo-400" /> AI Document Hub
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2">
              Document Analysis
            </h1>
            <p className="text-slate-400 text-lg max-w-xl font-medium">
              Upload your Project Charters, SRS, and architecture docs. The AI Engine will automatically parse and assess them for risks.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
        {/* ── Left Sidebar (Upload & Chat) ── */}
        <div className="flex flex-col gap-6">
          {/* ── Upload Panel ── */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Upload New Document</h3>
          <form onSubmit={handleUpload} className="space-y-4">

            {/* Project selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Select Project</label>
              {projects.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  No projects yet. <Link to="/projects" className="text-indigo-600 font-bold hover:underline">Create one first →</Link>
                </div>
              ) : (
                <select
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow outline-none bg-white"
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  required
                >
                  <option value="">— Choose a project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* Drop zone */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Document</label>
              <div
                className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !file && fileInputRef.current?.click()}
                style={{ cursor: file ? 'default' : 'pointer' }}
              >
                {!file ? (
                  <>
                    <UploadCloud size={34} color={dragOver ? '#6366f1' : '#94a3b8'} style={{ marginBottom: 10 }} />
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#475569' }}>
                      {dragOver ? 'Drop your file here!' : 'Drag & drop or click to browse'}
                    </p>
                    <p style={{ margin: '0 0 14px', fontSize: 12, color: '#94a3b8' }}>PDF, DOCX, TXT, CSV · Max 50MB</p>
                    <span className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px', pointerEvents: 'none' }}>
                      Choose File
                    </span>
                  </>
                ) : (
                  <div style={{ width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <FileText size={18} color="#10b981" style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{formatSize(file.size)}</p>
                        </div>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex', flexShrink: 0 }}>
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} id="file-upload" type="file" onChange={handleFileChange}
                  style={{ display: 'none' }} accept=".pdf,.doc,.docx,.txt,.csv" />
              </div>
            </div>

            {/* Status message */}
            {uploadStatus && (
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${uploadStatus.type === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                {uploadStatus.type === 'success'
                  ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  : <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />}
                <p className={`text-sm font-medium leading-relaxed ${uploadStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {uploadStatus.message}
                </p>
              </div>
            )}

            <button type="submit" className="w-full btn-primary py-3 font-bold shadow-lg shadow-indigo-500/20 hover-lift mt-2 flex items-center justify-center gap-2" disabled={!file || !selectedProject || uploading}>
              {uploading ? <><div className="spinner w-4 h-4 border-2 border-t-white" /> Uploading...</>
                : <><UploadCloud size={18} /> Analyze with Groq AI</>}
            </button>
          </form>
        </div>

        {/* ── Chat Panel ── */}
        {selectedProject && (
          <div className="flex flex-col gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                  <Wand2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">Generate Documentation</h3>
                  <p className="text-sm text-slate-500 mb-4 leading-relaxed">
                    Automatically synthesize a Master Risk Register, User Story Backlog, or Action Item list from all uploaded documents.
                  </p>
                  <button 
                    onClick={() => setShowGenModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                  >
                    <Wand2 size={16} /> Open Generator
                  </button>
                </div>
              </div>
            </div>
            
            <div className="h-[400px]">
              <ProjectChat projectId={selectedProject} />
            </div>
          </div>
        )}
      </div>

        {/* ── Project-level intelligence, trend and team ── */}
        {selectedProject && (
          <div className="flex flex-col gap-6 min-w-0">
            <ProjectIntelligence projectId={selectedProject} />
            <TaskBoard projectId={selectedProject} />
            <div className="intel-grid">
              <HealthTrend projectId={selectedProject} />
              <div>
                <TeamPanel projectId={selectedProject} />
                <RiskAlerts projectId={selectedProject} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Documents Table ── */}
        <div className="glass-panel rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                Uploaded Files
                {processingCount > 0 && (
                  <span className="text-xs font-semibold text-amber-500 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    {processingCount} analyzing
                  </span>
                )}
              </h3>
              {selectedProject && documents.length > 0 && (
                <p className="text-sm text-slate-500 mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
              )}
            </div>
            {selectedProject && (
              <button onClick={() => fetchDocuments(selectedProject)} className="flex items-center gap-1.5 text-sm font-bold bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <RefreshCw size={14} /> Refresh
              </button>
            )}
          </div>

          {rowError && (
            <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700 flex-1">{rowError}</p>
              <button onClick={() => setRowError('')} className="text-rose-400 hover:text-rose-600 shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          {!selectedProject ? (
            <div className="text-center py-16 bg-slate-50">
              <FileText size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Select a project above to see its documents</p>
            </div>
          ) : loadingDocs ? (
            <div className="flex items-center gap-3 text-slate-500 p-16 justify-center">
              <div className="spinner" /> Loading documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <UploadCloud size={34} />
              <p>No documents yet for this project.<br />Upload one to begin AI analysis.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Document Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={14} color="#6366f1" />
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }} title={doc.originalName}>
                        <span style={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {doc.originalName}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        {doc.fileType?.split('/')[1]?.split('.').pop() || '—'}
                      </td>
                      <td style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>{formatSize(doc.size)}</td>
                      <td style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(doc.uploadDate || doc.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td>
                        <span className={`risk-badge ${doc.status}`} style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {doc.status === 'Processing' && <span className="status-dot processing" />}
                          {doc.status}
                        </span>
                      </td>
                      <td>
                        {doc.riskLevel
                          ? <span className={`risk-badge ${doc.riskLevel}`} style={{ fontSize: 10 }}>{doc.riskLevel}</span>
                          : <span style={{ color: '#e2e8f0', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewText(doc.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#64748b', textDecoration: 'none', padding: '4px 10px', background: '#f1f5f9', border: 'none', cursor: 'pointer', borderRadius: 8, whiteSpace: 'nowrap' }}
                            className="hover:bg-slate-200 transition-colors"
                          >
                            <FileText size={12} /> View File
                          </button>
                          {doc.status === 'Analyzed' ? (
                            <Link
                              to={`/report/${doc.id}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#6366f1', textDecoration: 'none', padding: '4px 10px', background: '#eef2ff', borderRadius: 8, whiteSpace: 'nowrap' }}
                            >
                              <Eye size={12} /> View Report
                            </Link>
                          ) : doc.status === 'Processing' ? (
                            <span style={{ fontSize: 12, color: '#f59e0b' }}>Analyzing...</span>
                          ) : doc.status === 'Failed' ? (
                            <span style={{ fontSize: 12, color: '#ef4444' }} title={doc.errorMessage}>Failed</span>
                          ) : null}

                          {doc.status !== 'Processing' && (
                            <button
                              onClick={() => handleReanalyze(doc)}
                              disabled={rowBusy === doc.id}
                              title="Run the analysis again"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#0891b2', padding: '4px 10px', background: '#ecfeff', border: 'none', cursor: rowBusy === doc.id ? 'wait' : 'pointer', borderRadius: 8, whiteSpace: 'nowrap' }}
                            >
                              <RotateCw size={12} /> Re-analyse
                            </button>
                          )}

                          <button
                            onClick={() => setConfirmDeleteDoc(doc)}
                            disabled={rowBusy === doc.id}
                            title="Delete this document"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#b91c1c', padding: '4px 8px', background: '#fef2f2', border: 'none', cursor: 'pointer', borderRadius: 8 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {confirmDeleteDoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 420, width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>
              Delete "{confirmDeleteDoc.originalName}"?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              This removes the file, its analysis, and its content from the knowledge base,
              so the assistant will stop answering from it.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDeleteDoc(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#475569' }}
              >
                Keep document
              </button>
              <button
                onClick={() => handleDeleteDoc(confirmDeleteDoc)}
                disabled={rowBusy === confirmDeleteDoc.id}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {rowBusy === confirmDeleteDoc.id ? 'Deleting...' : 'Delete document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Generator Modal ── */}
      <DocumentGeneratorModal 
        isOpen={showGenModal} 
        onClose={() => setShowGenModal(false)} 
        projectId={selectedProject} 
      />

      {/* ── Document Full Text Modal ── */}
      {(viewTextDoc || viewTextLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 md:p-8 fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="File preview"
          onClick={(e) => { if (e.target === e.currentTarget) setViewTextDoc(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative">
            {viewTextLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <h3 className="text-lg font-bold text-slate-800">Loading document content...</h3>
              </div>
            ) : viewTextDoc ? (
              <>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-indigo-600" /> 
                    {viewTextDoc.originalName}
                  </h3>
                  <button onClick={() => setViewTextDoc(null)} className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-md p-1 shadow-sm transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden bg-slate-100/50 flex flex-col">
                  {viewTextDoc.filename?.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={`${API_BASE_URL.replace(/\/api\/?$/, '')}/uploads/${viewTextDoc.filename}`}
                      className="w-full h-full border-0"
                      title={viewTextDoc.originalName}
                    />
                  ) : viewTextDoc.extractedText ? (
                    <div className="flex-1 overflow-y-auto p-6">
                      {viewTextDoc.filename?.toLowerCase().endsWith('.csv') ? (
                        <div className="overflow-x-auto bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                          <table className="min-w-full divide-y divide-slate-200">
                            {(() => {
                              const rows = viewTextDoc.extractedText.split('\n').filter(r => r.trim() !== '').map(r => r.split(','));
                              const headers = rows[0] || [];
                              const body = rows.slice(1);
                              return (
                                <>
                                  <thead className="bg-slate-50">
                                    <tr>
                                      {headers.map((h, i) => (
                                        <th key={i} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-slate-100">
                                    {body.map((row, i) => (
                                      <tr key={i} className="hover:bg-slate-50">
                                        {row.map((cell, j) => (
                                          <td key={j} className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </>
                              );
                            })()}
                          </table>
                        </div>
                      ) : (
                        <div className="prose prose-slate max-w-none prose-sm whitespace-pre-wrap font-mono text-slate-700 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                          {viewTextDoc.extractedText}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-500">
                      No document preview available. It may still be processing.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadDocuments;
