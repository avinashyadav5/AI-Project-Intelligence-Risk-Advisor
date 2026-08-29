import React, { useState } from 'react';
import { Wand2, X, CheckSquare, AlertCircle, CheckCircle, FileText, Download, Users } from 'lucide-react';
import { generateProjectDocument } from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DocumentGeneratorModal = ({ isOpen, onClose, projectId, defaultDocType = 'user_stories' }) => {
  const [genDocType, setGenDocType] = useState(defaultDocType);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  if (!isOpen) return null;

  const handleGenerateDocument = async () => {
    if (!projectId) {
      setGenError('No project associated. Please select a project first.');
      return;
    }
    if (!genDocType) return;
    
    setIsGenerating(true);
    setGenError('');
    setGenResult('');
    
    try {
      const res = await generateProjectDocument(projectId, genDocType);
      setGenResult(res.data.markdown || res.data);
    } catch (err) {
      setGenError("Failed to generate document: " + (err.response?.data?.error || err.message));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setGenResult('');
    setGenError('');
    onClose();
  };

  const docTypes = [
    { id: 'user_stories', title: 'Master User Stories', icon: <Users size={20} />, desc: 'Extracts all requirements into Agile user stories.' },
    { id: 'risk_register', title: 'Global Risk Register', icon: <AlertCircle size={20} />, desc: 'Synthesizes all potential risks into a master log.' },
    { id: 'action_items', title: 'Combined Action Items', icon: <CheckSquare size={20} />, desc: 'Consolidates all pending tasks and next steps.' },
    { id: 'srs', title: 'Software Requirements (SRS)', icon: <FileText size={20} />, desc: 'Drafts a formal SRS document outline.' },
    { id: 'api_specs', title: 'API Specifications', icon: <Wand2 size={20} />, desc: 'Endpoints, methods, payload structures, and auth details' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-slate-900/50 backdrop-blur-sm fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Wand2 size={20} /></div>
            <h2 className="text-xl font-bold text-slate-800">AI Document Generator</h2>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
          {!genResult && !isGenerating ? (
            <div className="flex flex-col items-center justify-center py-6 md:py-12 text-center">
              <h3 className="text-lg font-bold text-slate-800 mb-2">What would you like to generate?</h3>
              <p className="text-slate-500 max-w-md mb-8">
                The AI will read all documents uploaded to this project and synthesize a comprehensive master document for you.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {docTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setGenDocType(type.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      genDocType === type.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-100 hover:border-indigo-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`flex items-center gap-3 font-bold mb-2 ${genDocType === type.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                      <div className={`p-1.5 rounded-lg ${genDocType === type.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {type.icon}
                      </div>
                      {type.title}
                    </div>
                    <p className="text-sm text-slate-500 pl-11">{type.desc}</p>
                  </button>
                ))}
              </div>

              {genError && (
                <div className="mt-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm max-w-2xl w-full flex items-start gap-3 text-left">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  {genError}
                </div>
              )}

              <button 
                onClick={handleGenerateDocument}
                disabled={isGenerating}
                className="mt-8 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 hover-lift disabled:opacity-50"
              >
                <Wand2 size={18} /> Generate Document
              </button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center justify-center py-24 text-center h-full">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Synthesizing Document...</h3>
              <p className="text-slate-500 max-w-md">
                Reading the project's knowledge base and drafting the {genDocType.replace('_', ' ')}. This may take a minute...
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 capitalize">Generated {genDocType.replace('_', ' ')}</h3>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(genResult);
                      alert('Copied to clipboard!');
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors border border-slate-200"
                  >
                    Copy Markdown
                  </button>
                  <button 
                    onClick={() => {
                      const blob = new Blob([genResult], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${genDocType}_${projectId || 'project'}.md`;
                      a.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                  >
                    <Download size={16} /> Download .md
                  </button>
                </div>
              </div>
              <div className="w-full flex-1 p-8 bg-white border border-slate-200 rounded-xl overflow-y-auto shadow-inner prose prose-slate max-w-none prose-headings:text-indigo-950 prose-a:text-indigo-600 hover:prose-a:text-indigo-500 prose-table:border-collapse prose-th:bg-slate-50 prose-th:p-3 prose-td:p-3 prose-td:border-b prose-td:border-slate-100 prose-hr:border-slate-200" style={{ minHeight: '400px' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {genResult}
                </ReactMarkdown>
              </div>
              <button 
                onClick={() => { setGenResult(''); setGenError(''); }}
                className="mt-6 self-center text-sm font-semibold text-slate-500 hover:text-slate-800 underline"
              >
                Generate another document
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentGeneratorModal;
