const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const uploadRoutes = require('./routes/upload');
const documentRoutes = require('./routes/documents');
const chatRoutes = require('./routes/chat');
const teamsRoutes = require('./routes/teams');
const milestoneRoutes = require('./routes/milestones');
const dashboardRoutes = require('./routes/dashboard');


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());



app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Prisma Database initialized via routes ────────────────

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/dashboard', dashboardRoutes);

const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Real-time Chat Socket
io.on('connection', (socket) => {
  socket.on('join_project', (projectId) => {
    socket.join(projectId);
  });

  socket.on('send_message', async (data) => {
    try {
      // data: { projectId, senderId, content }
      const message = await prisma.groupMessage.create({
        data: {
          projectId: data.projectId,
          senderId: data.senderId,
          content: data.content,
        },
        include: { sender: { select: { id: true, name: true, role: true } } }
      });
      // Broadcast to everyone in the project (including sender, or UI can handle optimism)
      io.to(data.projectId).emit('new_message', message);
    } catch (err) {
      console.error("Socket error saving message:", err);
    }
  });
});

app.get('/health', (req, res) => res.json({ status: 'running', port: PORT }));

server.listen(PORT, () => console.log(`🚀 Express & Socket.io server running on port ${PORT}`));
