const express = require('express');
const router = express.Router();
const axios = require('axios');
const prisma = require('../prismaClient');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

// GET /api/chat/:projectId - Get chat history
router.get('/:projectId', async (req, res) => {
  try {
    const history = await prisma.chatMessage.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// POST /api/chat - Send a question to the AI assistant
router.post('/', async (req, res) => {
  try {
    const { projectId, question } = req.body;
    if (!projectId || !question) {
      return res.status(400).json({ error: 'projectId and question are required' });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { projectId, role: 'user', content: question }
    });

    // Fetch history
    const historyData = await prisma.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: 10 // last 10 messages for context
    });
    const history = historyData.map(h => ({ role: h.role, content: h.content }));

    // First, try the FAISS-backed chat endpoint
    let response = await axios.post(`${FASTAPI_URL}/chat`, {
      project_id: projectId,
      question: question,
      history: history
    }, { timeout: 60000 });

    // If FAISS had no context, fall back to database text
    if (response.data.grounded === false) {
      console.log('⚠️ FAISS empty for project, falling back to DB text...');

      // Fetch analyzed documents from PostgreSQL
      const docs = await prisma.document.findMany({
        where: { projectId, status: 'Analyzed' },
        select: { extractedText: true, originalName: true, summary: true },
      });

      if (docs.length > 0) {
        // Build context from DB-stored text (cap at ~8000 chars to avoid token overflow)
        const contextParts = docs.map(d => {
          const text = d.extractedText || d.summary || '';
          return `[Document: ${d.originalName}]\n${text.substring(0, 4000)}`;
        });
        const dbContext = contextParts.join('\n\n---\n\n').substring(0, 8000);

        // Call the fallback chat endpoint with DB context
        response = await axios.post(`${FASTAPI_URL}/chat`, {
          project_id: projectId,
          question: question,
          history: history,
          context_override: dbContext,
        }, { timeout: 60000 });
      }
    }

    // Save assistant message
    await prisma.chatMessage.create({
      data: {
        projectId,
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources || []
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ 
      error: 'Chat failed',
      answer: 'Sorry, I could not process your question. Please ensure documents have been uploaded and analyzed for this project.',
      sources: [],
      grounded: false
    });
  }
});

module.exports = router;
