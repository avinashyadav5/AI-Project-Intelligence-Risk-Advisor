import React, { useState, useEffect, useRef, useContext } from 'react';
import { io } from 'socket.io-client';
import { getProjectMessages, SOCKET_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { Send, User as UserIcon, ShieldAlert, Shield, Zap } from 'lucide-react';

const ProjectChat = ({ projectId }) => {
  const { user } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    // 1. Fetch historical messages
    const fetchHistory = async () => {
      try {
        const res = await getProjectMessages(projectId);
        setMessages(res.data);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };
    fetchHistory();

    // 2. Initialize an authenticated socket connection
    const token = localStorage.getItem('token');
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    setSocket(newSocket);

    // 3. Join the project room
    newSocket.emit('join_project', projectId);

    // 4. Listen for incoming messages
    newSocket.on('new_message', (msg) => {
      setMessages((prev) => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    });

    newSocket.on('connect_error', (err) => {
      setConnectionError(err.message || 'Could not connect to the chat server.');
    });
    newSocket.on('connect', () => setConnectionError(''));
    newSocket.on('join_error', ({ error }) => setConnectionError(error));
    newSocket.on('message_error', ({ error }) => setConnectionError(error));

    return () => {
      newSocket.disconnect();
    };
  }, [projectId]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    socket.emit('send_message', {
      projectId,
      content: newMessage,
    });
    setNewMessage('');
  };

  const getRoleBadge = (role) => {
    switch(role) {
      case 'auditor': return { color: 'text-danger', bg: 'bg-danger-bg', icon: ShieldAlert, label: 'Auditor' };
      case 'pm': return { color: 'text-accent', bg: 'bg-accent/10', icon: Shield, label: 'Manager' };
      case 'developer': return { color: 'text-info', bg: 'bg-info-bg', icon: Zap, label: 'Developer' };
      default: return { color: 'text-slate-500', bg: 'bg-slate-100', icon: UserIcon, label: role };
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex-1 min-h-[400px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-surface flex justify-between items-center">
        <div>
          <h3 className="font-bold text-main">Team Discussion</h3>
          <p className="text-xs text-muted">Real-time collaboration</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted">Live</span>
        </div>
      </div>

      {connectionError && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-700">
          {connectionError}
        </div>
      )}

      {/* Messages Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
            <UserIcon size={32} className="opacity-20" />
            <p className="text-sm">No messages yet. Start the discussion!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === user.id;
            const roleInfo = getRoleBadge(msg.sender?.role);
            const RoleIcon = roleInfo.icon;

            return (
              <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Name & Role Badge */}
                <div className="flex items-center gap-2 mb-1">
                  {!isMe && <span className="text-[11px] font-bold text-main">{msg.sender?.name}</span>}
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${roleInfo.bg} ${roleInfo.color}`}>
                    <RoleIcon size={10} />
                    {roleInfo.label}
                  </div>
                  {isMe && <span className="text-[11px] font-bold text-main">{msg.sender?.name}</span>}
                </div>
                
                {/* Message Bubble */}
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-white border border-border text-main rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
                
                {/* Timestamp */}
                <span className="text-[9px] text-muted mt-1 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-surface border-t border-border">
        <form onSubmit={handleSendMessage} className="relative flex items-center">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            aria-label="Message your team"
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="absolute right-2 p-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProjectChat;