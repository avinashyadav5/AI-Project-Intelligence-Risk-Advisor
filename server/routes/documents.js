const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess, requireRole } = require('../middleware/auth');
const ai = require('../utils/aiService');
const events = require('../utils/events');
const { removeUpload } = require('../utils/files');

/**
 * Route order matters in Express: specific paths (/stats/overview) must be
 * declared before the /:id wildcard, or "stats" is matched as an id.
 *
 * Every route here is authenticated. This file previously had no auth at all,
 * which meant any caller with a document id could read a full risk report.
 */

/** Project ids the caller is allowed to see. Used to scope aggregate queries. */
async function accessibleProjectIds(user) {
  if (user.role === 'admin') {
    const all = await prisma.project.findMany({ select: { id: true } });
    return all.map(p => p.id);
  }
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    select: { id: true },
  });
  return projects.map(p => p.id);
}

// ── GET /api/documents/stats/overview ────────────────────────────────────────
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const projectIds = await accessibleProjectIds(req.user);
    const scope = { projectId: { in: projectIds } };

    const [totalDocuments, analyzedDocuments, riskDistribution, avgRiskScoreResult] =
      await Promise.all([
        prisma.document.count({ where: scope }),
        prisma.document.count({ where: { ...scope, status: 'Analyzed' } }),
        prisma.document.groupBy({
          by: ['riskLevel'],
          _count: { riskLevel: true },
          where: { ...scope, riskLevel: { not: null } },
        }),
        prisma.document.aggregate({
          _avg: { riskScore: true },
          where: { ...scope, riskScore: { not: null } },
        }),
      ]);

    // Risk levels are stored capitalised by the scoring engine; compare
    // case-insensitively so a casing drift never zeroes the chart.
    const riskMap = { Low: 0, Medium: 0, High: 0, Critical: 0, Unknown: 0 };
    riskDistribution.forEach(r => {
      const key = Object.keys(riskMap).find(
        k => k.toLowerCase() === String(r.riskLevel).toLowerCase()
      );
      if (key) riskMap[key] += r._count.riskLevel;
    });

    res.json({
      totalProjects: projectIds.length,
      totalDocuments,
      analyzedDocuments,
      avgRiskScore:
        avgRiskScoreResult._avg.riskScore != null
          ? Math.round(avgRiskScoreResult._avg.riskScore)
          : null,
      riskDistribution: riskMap,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ── GET /api/documents/project/:projectId/health ─────────────────────────────
router.get(
  '/project/:projectId/health',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const docs = await prisma.document.findMany({
        where: {
          projectId: req.params.projectId,
          status: 'Analyzed',
          projectHealth: { not: null },
        },
        select: {
          id: true,
          projectHealth: true,
          riskScore: true,
          riskLevel: true,
          originalName: true,
          createdAt: true,
        },
      });

      if (docs.length === 0) {
        return res.json({
          score: null,
          grade: null,
          documents: 0,
          breakdown: [],
          message: 'No analyzed documents yet.',
        });
      }

      const avgHealth = Math.round(
        docs.reduce((sum, d) => sum + (d.projectHealth?.score || 0), 0) / docs.length
      );
      const grade =
        avgHealth >= 90 ? 'A' :
        avgHealth >= 80 ? 'B' :
        avgHealth >= 70 ? 'C' :
        avgHealth >= 60 ? 'D' : 'F';

      res.json({
        score: avgHealth,
        grade,
        documents: docs.length,
        breakdown: docs.map(d => ({
          id: d.id,
          name: d.originalName,
          health: d.projectHealth?.score,
          risk: d.riskScore,
          level: d.riskLevel,
          analyzedAt: d.createdAt,
        })),
      });
    } catch (err) {
      console.error('Project health error:', err);
      res.status(500).json({ error: 'Failed to fetch project health.' });
    }
  }
);

// ── GET /api/documents/project/:projectId/trends ─────────────────────────────
// Combines per-document scores with the project health timeline so the trend
// chart has real history to draw.
router.get(
  '/project/:projectId/trends',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const [docs, history] = await Promise.all([
        prisma.document.findMany({
          where: {
            projectId: req.params.projectId,
            status: 'Analyzed',
            riskScore: { not: null },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            originalName: true,
            riskScore: true,
            riskLevel: true,
            projectHealth: true,
            createdAt: true,
          },
        }),
        prisma.projectHealthHistory.findMany({
          where: { projectId: req.params.projectId },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
      ]);

      res.json({
        documents: docs.map(d => ({
          id: d.id,
          originalName: d.originalName,
          riskScore: d.riskScore,
          riskLevel: d.riskLevel,
          healthScore: d.projectHealth?.score ?? null,
          createdAt: d.createdAt,
        })),
        history,
      });
    } catch (err) {
      console.error('Trends error:', err);
      res.status(500).json({ error: 'Failed to fetch trends.' });
    }
  }
);

// ── GET /api/documents/:id ───────────────────────────────────────────────────
router.get(
  '/:id',
  auth,
  requireProjectAccess(async (req) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    return doc?.projectId;
  }),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Document not found.' });

      const project = await prisma.project.findUnique({
        where: { id: doc.projectId },
        select: { name: true, description: true },
      });

      res.json({ ...doc, projectId: project || doc.projectId, projectIdRaw: doc.projectId });
    } catch (err) {
      console.error('Error fetching document:', err);
      res.status(500).json({ error: 'Failed to fetch document.' });
    }
  }
);

// ── DELETE /api/documents/:id ────────────────────────────────────────────────
// Deleting a document also removes its chunks from the knowledge base, so the
// assistant stops answering from a file the team has removed.
router.delete(
  '/:id',
  auth,
  requireProjectAccess(async (req) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    return doc?.projectId;
  }),
  requireRole('pm'),
  async (req, res) => {
    try {
      const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Document not found.' });

      await ai.purgeDocumentFromKB(doc.projectId, doc.id);
      removeUpload(doc.filename);
      await prisma.document.delete({ where: { id: doc.id } });

      await events.logActivity(doc.projectId, req.user.id, 'document.deleted', {
        documentId: doc.id,
        name: doc.originalName,
      });

      res.json({ message: 'Document deleted.', id: doc.id });
    } catch (err) {
      console.error('Error deleting document:', err);
      res.status(500).json({ error: 'Failed to delete document.' });
    }
  }
);

// ── PATCH /api/documents/:id/report-state ────────────────────────────────────
// Ticking an action item or dismissing a blocker was React state only: it was
// lost on refresh and invisible to everyone else on the project. Now it is
// stored with the document, so the report reflects what the team has done.
router.patch(
  '/:id/report-state',
  auth,
  requireProjectAccess(async (req) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    return doc?.projectId;
  }),
  requireRole('pm', 'developer'),
  async (req, res) => {
    try {
      const { completedActionItems, dismissedBlockers } = req.body;
      const data = {};

      // Indices only — anything else is a malformed client payload.
      const sanitise = (value) =>
        Array.isArray(value)
          ? [...new Set(value.filter(n => Number.isInteger(n) && n >= 0 && n < 500))]
          : undefined;

      const items = sanitise(completedActionItems);
      const blockers = sanitise(dismissedBlockers);
      if (items !== undefined) data.completedActionItems = items;
      if (blockers !== undefined) data.dismissedBlockers = blockers;

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Nothing to update.' });
      }

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data,
        select: { id: true, completedActionItems: true, dismissedBlockers: true },
      });

      res.json(updated);
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Document not found.' });
      console.error('Report state update failed:', err);
      res.status(500).json({ error: 'Could not save your changes.' });
    }
  }
);

module.exports = router;
