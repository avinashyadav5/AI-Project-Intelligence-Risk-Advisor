const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { securityHeaders, rateLimit } = require('./middleware/security');
const { startMaintenance } = require('./utils/maintenance');

dotenv.config();

const prisma = require('./prismaClient');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const uploadRoutes = require('./routes/upload');
const documentRoutes = require('./routes/documents');
const chatRoutes = require('./routes/chat');
const teamsRoutes = require('./routes/teams');
const milestoneRoutes = require('./routes/milestones');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfallbackkey';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || CLIENT_URL)
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No Origin header: same-origin requests, curl, Postman, health probes.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true,
}));

app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));

// Broad ceiling for the API, with a much tighter one on the endpoints worth
// brute-forcing or worth money.
app.use('/api', rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'api' }));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60_000, max: 10, keyPrefix: 'login',
  message: 'Too many sign-in attempts. Try again in a few minutes.',
}));
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60_000, max: 10, keyPrefix: 'register',
  message: 'Too many accounts created from this address. Try again later.',
}));
// Each analysis costs several LLM calls, so it gets its own budget.
app.use('/api/chat', rateLimit({
  windowMs: 60_000, max: 20, keyPrefix: 'chat',
  message: 'You are sending questions faster than the assistant can answer. Wait a moment.',
}));
app.use('/api/upload', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'upload' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/health', (req, res) => res.json({ status: 'running', port: PORT }));

// ── Fallbacks ─────────────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route matches ${req.method} ${req.originalUrl}` });
});

// Without this, an error thrown in middleware (multer, body parsing) escapes to
// Express's default handler and the client receives an HTML error page where it
// expects JSON.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

// ── Real-time team chat ───────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_URL === '*' ? '*' : [CLIENT_URL, 'http://localhost:5173'] } });

/**
 * The socket used to accept any connection and trust whatever senderId the
 * client sent, so anyone could join a project room and post as another user.
 * The JWT is now verified during the handshake and the sender is taken from
 * the token, never from the payload.
 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

/** Confirm this socket's user is on the project before joining its room. */
async function canAccessProject(userId, role, projectId) {
  if (!projectId) return false;
  if (role === 'admin') return true;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true } } },
  });
  if (!project) return false;
  return project.ownerId === userId || project.members.some(m => m.userId === userId);
}

io.on('connection', (socket) => {
  socket.on('join_project', async (projectId) => {
    const allowed = await canAccessProject(socket.user.id, socket.user.role, projectId);
    if (!allowed) {
      socket.emit('join_error', { projectId, error: 'You do not have access to this project.' });
      return;
    }
    socket.join(projectId);
    socket.emit('joined_project', { projectId });
  });

  socket.on('send_message', async (data) => {
    try {
      const { projectId, content } = data || {};
      if (!projectId || !content || !String(content).trim()) return;

      const allowed = await canAccessProject(socket.user.id, socket.user.role, projectId);
      if (!allowed) {
        socket.emit('message_error', { error: 'You do not have access to this project.' });
        return;
      }

      const message = await prisma.groupMessage.create({
        data: {
          projectId,
          senderId: socket.user.id, // from the token, not the payload
          content: String(content).slice(0, 4000),
        },
        include: { sender: { select: { id: true, name: true, role: true } } },
      });

      io.to(projectId).emit('new_message', message);
    } catch (err) {
      console.error('Socket error saving message:', err);
      socket.emit('message_error', { error: 'Your message could not be sent.' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Express and Socket.io server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  // Recover any analysis left mid-flight by the previous shutdown.
  startMaintenance();
});
