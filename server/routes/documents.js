const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

/**
 * IMPORTANT — Route order matters in Express.
 * Specific routes (e.g. /stats/overview) MUST be declared BEFORE wildcard routes (/:id),
 * otherwise Express will match "stats" as an :id parameter and return a CastError.
 */

// ── GET /api/documents/stats/overview — Dashboard aggregation ─────────────────
router.get('/stats/overview', async (req, res) => {
  try {
    const [
      totalProjects,
      totalDocuments,
      analyzedDocuments,
      riskDistribution,
      avgRiskScoreResult,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.document.count(),
      prisma.document.count({ where: { status: 'Analyzed' } }),
      prisma.document.groupBy({
        by: ['riskLevel'],
        _count: { riskLevel: true },
        where: { riskLevel: { not: null } }
      }),
      prisma.document.aggregate({
        _avg: { riskScore: true },
        where: { riskScore: { not: null } }
      }),
    ]);

    const riskMap = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    riskDistribution.forEach(r => {
      if (riskMap[r.riskLevel] !== undefined) riskMap[r.riskLevel] = r._count.riskLevel;
    });

    res.json({
      totalProjects,
      totalDocuments,
      analyzedDocuments,
      avgRiskScore: avgRiskScoreResult._avg.riskScore != null
        ? Math.round(avgRiskScoreResult._avg.riskScore)
        : null,
      riskDistribution: riskMap,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/documents/project/:projectId/health - Aggregated project health
router.get('/project/:projectId/health', async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: {
        projectId: req.params.projectId,
        status: 'Analyzed',
        projectHealth: { not: null }
      },
      select: { projectHealth: true, riskScore: true, riskLevel: true, originalName: true }
    });

    if (docs.length === 0) {
      return res.json({ score: null, grade: null, documents: 0, message: 'No analyzed documents found' });
    }

    const avgHealth = Math.round(docs.reduce((sum, d) => sum + (d.projectHealth?.score || 0), 0) / docs.length);
    const grade = avgHealth >= 85 ? 'A' : avgHealth >= 70 ? 'B' : avgHealth >= 55 ? 'C' : avgHealth >= 40 ? 'D' : 'F';

    res.json({
      score: avgHealth,
      grade,
      documents: docs.length,
      breakdown: docs.map(d => ({
        name: d.originalName,
        health: d.projectHealth?.score,
        risk: d.riskScore,
        level: d.riskLevel
      }))
    });
  } catch (err) {
    console.error('Project health error:', err);
    res.status(500).json({ error: 'Failed to fetch project health' });
  }
});

// GET /api/documents/project/:projectId/trends - Historical risk trends
router.get('/project/:projectId/trends', async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      where: {
        projectId: req.params.projectId,
        status: 'Analyzed',
        riskScore: { not: null }
      },
      orderBy: { createdAt: 'asc' },
      select: { originalName: true, riskScore: true, createdAt: true }
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// ── GET /api/documents/:id — Full document report ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id }
    });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    // Simulate Mongoose populate('projectId', 'name description')
    const project = await prisma.project.findUnique({
      where: { id: doc.projectId },
      select: { name: true, description: true }
    });
    
    const responseDoc = {
      ...doc,
      projectId: project || doc.projectId
    };
    
    res.json(responseDoc);
  } catch (err) {
    console.error('Error fetching document:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

module.exports = router;
