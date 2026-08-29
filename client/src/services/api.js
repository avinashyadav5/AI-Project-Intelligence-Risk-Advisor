import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 30000,
});

// ── Interceptor: attach token ─────────────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Interceptor: log errors in dev ────────────────────────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    console.error('[API Error]', err.response?.data || err.message);
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data);
export const register = (data) => api.post('/auth/register', data);
export const getMe = () => api.get('/auth/me');

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects = () => api.get('/projects');
export const createProject = (data) => api.post('/projects', data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const getProjectMessages = (id) => api.get(`/projects/${id}/messages`);
export const generateProjectDocument = (id, docType) => api.post(`/projects/${id}/generate-document`, { docType });
// ── Upload & Documents ────────────────────────────────────────────────────────
export const uploadFile = (formData) => api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const getProjectFiles = (projectId) => api.get(`/upload/project/${projectId}`);

// ── AI Analysis Results ────────────────────────────────────────────────────────
export const getDocument = (id) => api.get(`/documents/${id}`);
export const getStats = () => api.get('/documents/stats/overview');
export const getProjectTrends = (projectId) => api.get(`/documents/project/${projectId}/trends`);

export const sendChatMessage = (projectId, question) => api.post('/chat', { projectId, question });
export const getChatHistory = (projectId) => api.get(`/chat/${projectId}`);
export const getProjectHealth = (projectId) => api.get(`/documents/project/${projectId}/health`);

export default api;
