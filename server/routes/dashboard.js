const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const auth = require('../middleware/auth');

// GET /api/dashboard/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'pm' || role === 'admin') {
      // 1. Get projects owned by PM or where they are a member
      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId: userId } } }
          ]
        },
        include: {
          documents: true,
          members: true
        }
      });

      const activeProjects = projects.length;
      
      // Calculate team members (unique members across all projects)
      const uniqueMembers = new Set();
      projects.forEach(p => p.members.forEach(m => uniqueMembers.add(m.userId)));
      const teamMembersCount = uniqueMembers.size;

      // Calculate Avg Health and Critical Risks
      let totalHealth = 0;
      let healthCount = 0;
      let criticalRisksCount = 0;

      projects.forEach(p => {
        p.documents.forEach(doc => {
          if (doc.projectHealth && typeof doc.projectHealth === 'object' && doc.projectHealth.score) {
            totalHealth += doc.projectHealth.score;
            healthCount++;
          }
          if (doc.riskLevel === 'critical' || doc.riskLevel === 'high') {
            criticalRisksCount++;
          }
        });
      });

      const avgHealth = healthCount > 0 ? Math.round(totalHealth / healthCount) : 0;

      return res.json({
        activeProjects,
        avgHealth,
        criticalRisksCount,
        teamMembersCount
      });
    } 
    else if (role === 'developer') {
      // Find projects the developer is part of
      const projects = await prisma.project.findMany({
        where: { members: { some: { userId: userId } } },
        select: { id: true }
      });
      const projectIds = projects.map(p => p.id);

      // Find tasks (Milestones) in those projects
      const tasks = await prisma.milestone.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { createdAt: 'desc' }
      });

      const myTasks = tasks.length;
      
      // Calculate deadlines this week
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const deadlines = tasks.filter(t => t.dueDate && new Date(t.dueDate) > now && new Date(t.dueDate) < nextWeek).length;

      return res.json({
        myTasks,
        deadlines,
        tasks
      });
    }
    else if (role === 'auditor') {
      const projects = await prisma.project.findMany({
        where: { members: { some: { userId: userId } } },
        include: { documents: true }
      });

      let compliantProjects = 0;
      let missingDocsCount = 0;
      let traceabilityGaps = 0;

      projects.forEach(p => {
        let isCompliant = true;
        p.documents.forEach(doc => {
          if (doc.riskLevel === 'critical') isCompliant = false;
          
          if (doc.missingDocs && Array.isArray(doc.missingDocs)) {
            missingDocsCount += doc.missingDocs.length;
          }
          
          if (doc.traceability && Array.isArray(doc.traceability)) {
            // Very simplified trace gap count
            traceabilityGaps += doc.traceability.filter(t => !t.satisfied).length;
          }
        });
        if (isCompliant && p.documents.length > 0) compliantProjects++;
      });

      return res.json({
        compliantProjects,
        missingDocsCount,
        traceabilityGaps
      });
    }

    return res.status(400).json({ error: "Invalid role" });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }
});

module.exports = router;
