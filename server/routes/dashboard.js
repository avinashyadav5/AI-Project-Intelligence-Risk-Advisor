const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');

/**
 * Role-aware dashboard aggregates.
 *
 * The risk comparisons here used lowercase literals ('critical', 'high') while
 * the scoring engine writes capitalised bands ('Critical', 'High'), so the PM's
 * critical-risk counter was permanently zero and every project looked compliant
 * to the auditor. All comparisons are now normalised.
 */

const isHighRisk = level => ['critical', 'high'].includes(String(level || '').toLowerCase());
const isCritical = level => String(level || '').toLowerCase() === 'critical';

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const membershipFilter = {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    };

    if (role === 'pm' || role === 'admin') {
      const projects = await prisma.project.findMany({
        where: role === 'admin' ? {} : membershipFilter,
        include: { documents: true, members: true },
      });

      const uniqueMembers = new Set();
      projects.forEach(p => p.members.forEach(m => uniqueMembers.add(m.userId)));

      let totalHealth = 0;
      let healthCount = 0;
      let criticalRisksCount = 0;
      let analyzedDocuments = 0;

      projects.forEach(p => {
        p.documents.forEach(doc => {
          if (doc.status === 'Analyzed') analyzedDocuments++;
          const score = doc.projectHealth && typeof doc.projectHealth === 'object'
            ? doc.projectHealth.score
            : null;
          if (typeof score === 'number') {
            totalHealth += score;
            healthCount++;
          }
          if (isHighRisk(doc.riskLevel)) criticalRisksCount++;
        });
      });

      const unreadNotifications = await prisma.notification.count({
        where: { userId, isRead: false },
      });

      return res.json({
        activeProjects: projects.length,
        avgHealth: healthCount > 0 ? Math.round(totalHealth / healthCount) : 0,
        criticalRisksCount,
        teamMembersCount: uniqueMembers.size,
        analyzedDocuments,
        unreadNotifications,
      });
    }

    if (role === 'developer') {
      const projects = await prisma.project.findMany({
        where: { members: { some: { userId } } },
        select: { id: true },
      });
      const projectIds = projects.map(p => p.id);

      const tasks = await prisma.milestone.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          project: { select: { id: true, name: true } },
          dependencies: { include: { dependsOn: { select: { id: true, name: true, status: true } } } },
        },
      });

      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const isDone = t => t.status === 'completed';
      const deadlines = tasks.filter(
        t => t.dueDate && !isDone(t) && new Date(t.dueDate) > now && new Date(t.dueDate) < nextWeek
      ).length;
      const overdue = tasks.filter(
        t => t.dueDate && !isDone(t) && new Date(t.dueDate) < now
      ).length;
      const blocked = tasks.filter(t => t.status === 'blocked').length;

      return res.json({
        myTasks: tasks.filter(t => !isDone(t)).length,
        totalTasks: tasks.length,
        deadlines,
        overdue,
        blocked,
        completed: tasks.filter(isDone).length,
        tasks,
      });
    }

    if (role === 'auditor') {
      const projects = await prisma.project.findMany({
        where: membershipFilter,
        include: { documents: true },
      });

      let compliantProjects = 0;
      let missingDocsCount = 0;
      let traceabilityGaps = 0;
      let criticalFindings = 0;

      projects.forEach(p => {
        let isCompliant = p.documents.length > 0;
        p.documents.forEach(doc => {
          if (isCritical(doc.riskLevel)) {
            isCompliant = false;
            criticalFindings++;
          }
          if (Array.isArray(doc.missingDocs)) missingDocsCount += doc.missingDocs.length;
          if (Array.isArray(doc.traceability)) {
            // A gap object records satisfied:false. Treat a missing flag as an
            // open gap, but never count an explicitly satisfied one.
            traceabilityGaps += doc.traceability.filter(t => t && t.satisfied !== true).length;
          }
        });
        if (isCompliant) compliantProjects++;
      });

      return res.json({
        totalProjects: projects.length,
        compliantProjects,
        missingDocsCount,
        traceabilityGaps,
        criticalFindings,
      });
    }

    return res.status(400).json({ error: 'Unknown role.' });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard stats.' });
  }
});

module.exports = router;
