import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Bot, User, FolderKanban } from 'lucide-react';
import { getProjects, sendChatMessage, getChatHistory, clearChatHistory } from '../services/api';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(localStorage.getItem('lastSelectedProject') || '');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    getProjects().then(res => {
      setProjects(res.data);
      const localProject = localStorage.getItem('lastSelectedProject');
      const currentExists = res.data.some(p => p.id === selectedProject);

      if (!currentExists && res.data.length > 0) {
        if (localProject && res.data.some(p => p.id === localProject)) {
          setSelectedProject(localProject);
        } else {
          setSelectedProject(res.data[0].id);
        }
      }
    }).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setMessages([]);
      return;
    }
    localStorage.setItem('lastSelectedProject', selectedProject);

    let cancelled = false;
    setHistoryLoading(true);
    getChatHistory(selectedProject)
      .then(res => {
        if (cancelled) return;
        setMessages(res.data.map(m => ({
          role: m.role,
          content: m.content,
          sources: Array.isArray(m.sources) ? m.sources : [],
        })));
      })
      .catch(() => { if (!cancelled) setMessages([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });

    return () => { cancelled = true; };
  }, [selectedProject]);

  const handleClear = async () => {
    if (!selectedProject) return;
    try {
      await clearChatHistory(selectedProject);
      setMessages([]);
    } catch (err) {
      console.error('Could not clear the conversation', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedProject) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChatMessage(selectedProject, userMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources
      }]);
    } catch (err) {
      const detail = err?.response?.data?.answer
        || err?.response?.data?.error
        || 'I could not reach the assistant. Check that the AI service is running and try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: detail }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', background: '#fff', borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#e0e7ff', padding: 8, borderRadius: 10, color: '#4f46e5' }}>
            <MessageSquare size={20} />
          </div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>AI Project Assistant</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderKanban size={16} color="#64748b" />
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', outline: 'none', fontSize: 14, color: '#334155', minWidth: 200 }}
          >
            {projects.length === 0 ? <option value="">No projects available</option> : null}
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleClear}
            disabled={!selectedProject || messages.length === 0}
            title="Clear this conversation"
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: '#fff', fontSize: 13, color: '#64748b',
              cursor: selectedProject && messages.length > 0 ? 'pointer' : 'not-allowed',
              opacity: selectedProject && messages.length > 0 ? 1 : 0.5,
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {messages.length === 0 && !loading && !historyLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
            <Bot size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <p style={{ fontSize: 16, margin: 0 }}>Ask anything about your project documents...</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 16, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: msg.role === 'user' ? '#4f46e5' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: msg.role === 'user' ? '#fff' : '#475569', flexShrink: 0 }}>
              {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
            </div>
            <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ background: msg.role === 'user' ? '#6366f1' : '#f1f5f9', color: msg.role === 'user' ? '#fff' : '#1e293b', padding: '12px 16px', borderRadius: 12, borderTopRightRadius: msg.role === 'user' ? 2 : 12, borderTopLeftRadius: msg.role === 'user' ? 12 : 2, fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Sources:</span>
                  {msg.sources.map((src, i) => (
                    <span key={i} style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>{src.doc_name || src.documentName || src.originalName || 'Document'}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', flexShrink: 0 }}>
              <Bot size={18} />
            </div>
            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: 12, borderTopLeftRadius: 2, display: 'flex', gap: 6 }}>
              <span className="dot-anim" style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out' }} />
              <span className="dot-anim" style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out 0.2s' }} />
              <span className="dot-anim" style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out 0.4s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '20px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', padding: '8px 8px 8px 16px', borderRadius: 99, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            aria-label="Ask a question about this project"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#0f172a', background: 'transparent' }}
            disabled={!selectedProject || loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || !selectedProject || loading}
            style={{ background: input.trim() && selectedProject && !loading ? '#4f46e5' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && selectedProject && !loading ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
          >
            <Send size={18} style={{ marginLeft: -2 }} />
          </button>
        </form>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Chat;
