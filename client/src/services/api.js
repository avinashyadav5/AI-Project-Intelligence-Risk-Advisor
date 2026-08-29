import axios from 'axios';

/**
 * The base URL was hardcoded to localhost, so a build could never talk to any
 * other backend. VITE_API_URL now wins when it is set at build time.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Socket.io connects to the server root, not the /api prefix. */
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

// ── Interceptor: attach token ─────────────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Interceptor: surface errors, sign out on 401 ──────────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    console.error('[API Error]', err.response?.data || err.message);
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

/** Pull a readable message out of an axios error for display in the UI. */
export const errorMessage = (err, fallback = 'Something went wrong.') =>
  err?.response?.data?.error || err?.response?.data?.detail || err?.message || fallback;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const getProjectMessages = (id) => api.get(`/projects/${id}/messages`);
export const getProjectActivity = (id, limit = 20) =>
  api.get(`/projects/${id}/activity`, { params: { limit } });

// ── Project-level intelligence (unified knowledge base) ───────────────────────
export const runProjectAnalysis = (id) =>
  api.post(`/projects/${id}/analyze`, {}, { timeout: 300000 });
export const getProjectIntelligence = (id) => api.get(`/projects/${id}/intelligence`);

// ── Document generation ───────────────────────────────────────────────────────
export const generateProjectDocument = (id, docType) =>
  api.post(`/projects/${id}/generate-document`, { docType }, { timeout: 180000 });
export const getGeneratedDocuments = (id) => api.get(`/projects/${id}/generated-documents`);
export const getGeneratedDocument = (id, docId) =>
  api.get(`/projects/${id}/generated-documents/${docId}`);

// ── Upload & Documents ────────────────────────────────────────────────────────
export const uploadFile = (formData) => api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 120000,
});
export const getProjectFiles = (projectId) => api.get(`/upload/project/${projectId}`);
export const reanalyzeDocument = (documentId) => api.post(`/upload/${documentId}/reanalyze`);
export const getDocument = (id) => api.get(`/documents/${id}`);
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const saveReportState = (id, state) => api.patch(`/documents/${id}/report-state`, state);
export const getStats = () => api.get('/documents/stats/overview');
export const getProjectTrends = (projectId) => api.get(`/documents/project/${projectId}/trends`);
export const getProjectHealth = (projectId) => api.get(`/documents/project/${projectId}/health`);

// ── AI assistant ──────────────────────────────────────────────────────────────
export const sendChatMessage = (projectId, question) =>
  api.post('/chat', { projectId, question }, { timeout: 90000 });
export const getChatHistory = (projectId) => api.get(`/chat/${projectId}`);
export const clearChatHistory = (projectId) => api.delete(`/chat/${projectId}`);

// ── Team ──────────────────────────────────────────────────────────────────────
export const getTeamMembers = (projectId) => api.get(`/teams/${projectId}`);
export const inviteMember = (data) => api.post('/teams/invite', data);
export const joinProject = (token) => api.post('/teams/join', { token });
export const removeMember = (projectId, userId) =>
  api.delete(`/teams/${projectId}/members/${userId}`);

// ── Tasks / milestones ────────────────────────────────────────────────────────
export const getMilestones = (projectId) => api.get(`/milestones/${projectId}`);
export const createMilestone = (data) => api.post('/milestones', data);
export const updateMilestone = (id, data) => api.patch(`/milestones/${id}/progress`, data);
export const deleteMilestone = (id) => api.delete(`/milestones/${id}`);

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = (params = {}) => api.get('/notifications', { params });
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');
export const getProjectAlerts = (projectId) => api.get(`/notifications/alerts/${projectId}`);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboardStats = () => api.get('/dashboard/stats');

export default api;
