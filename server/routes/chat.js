const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/auth');
const ai = require('../utils/aiService');

/**
 * Conversational assistant, grounded in the project knowledge base.
 *
 * Two things were broken here: the route had no auth (any caller could query
 * another team's documents), and the conversation history was sent to the AI
 * service in a field its request model didn't declare, so it was silently
 * dropped and every question was answered cold.
 */

// ── GET /api/chat/:projectId — conversation history ──────────────────────────
router.get(
  '/:projectId',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const history = await prisma.chatMessage.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      res.json(history);
    } catch (err) {
      console.error('Chat history error:', err);
      res.status(500).json({ error: 'Failed to fetch chat history.' });
    }
  }
);

// ── DELETE /api/chat/:projectId — clear the thread ───────────────────────────
router.delete(
  '/:projectId',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const { count } = await prisma.chatMessage.deleteMany({
        where: { projectId: req.params.projectId },
      });
      res.json({ message: 'Conversation cleared.', deleted: count });
    } catch (err) {
      console.error('Chat clear error:', err);
      res.status(500).json({ error: 'Failed to clear the conversation.' });
    }
  }
);

// ── POST /api/chat — ask a question ──────────────────────────────────────────
router.post(
  '/',
  auth,
  requireProjectAccess(req => req.body.projectId),
  async (req, res) => {
    const { projectId, question } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'A question is required.' });
    }

    try {
      // Read the prior turns BEFORE saving this one, so the current question
      // isn't duplicated as both history and prompt.
      const priorTurns = await prisma.chatMessage.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { role: true, content: true },
      });
      const history = priorTurns.reverse().map(h => ({ role: h.role, content: h.content }));

      await prisma.chatMessage.create({
        data: { projectId, role: 'user', content: question },
      });

      let response = await ai.post('/chat', {
        project_id: projectId,
        question,
        history,
      }, { timeout: 60000 });

      // If the knowledge base has nothing indexed, fall back to the extracted
      // text stored in Postgres so the assistant still has something to work with.
      if (response.data.grounded === false) {
        console.log('Knowledge base empty for project, falling back to stored text.');

        const docs = await prisma.document.findMany({
          where: { projectId, status: 'Analyzed' },
          select: { extractedText: true, originalName: true, summary: true },
        });

        if (docs.length > 0) {
          const dbContext = docs
            .map(d => `[Document: ${d.originalName}]\n${(d.extractedText || d.summary || '').substring(0, 4000)}`)
            .join('\n\n---\n\n')
            .substring(0, 8000);

          response = await ai.post('/chat', {
            project_id: projectId,
            question,
            history,
            context_override: dbContext,
          }, { timeout: 60000 });
        }
      }

      await prisma.chatMessage.create({
        data: {
          projectId,
          role: 'assistant',
          content: response.data.answer,
          sources: response.data.sources || [],
        },
      });

      res.json(response.data);
    } catch (err) {
      console.error('Chat error:', err.message);
      res.status(502).json({
        error: 'The assistant could not be reached.',
        answer: 'I could not process that question. Check that documents have been uploaded and analyzed for this project, then try again.',
        sources: [],
        grounded: false,
      });
    }
  }
);

module.exports = router;
