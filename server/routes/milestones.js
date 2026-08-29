const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const verifyToken = async (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretfallbackkey');
    req.user = decoded;
    next();
  } catch(err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/', verifyToken, async (req, res) => {
  try {
    const { projectId, name, description, dueDate, dependencies } = req.body;
    
    // PMs and Developers can create milestones/tasks (Admin also)
    if (req.user.role === 'auditor') return res.status(403).json({ error: 'Auditors cannot create milestones' });

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        name,
        description,
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });

    if (dependencies && dependencies.length > 0) {
      const deps = dependencies.map(depId => ({
        taskId: milestone.id,
        dependsOnId: depId
      }));
      await prisma.taskDependency.createMany({ data: deps });
    }

    res.json(milestone);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      include: {
        dependencies: { include: { dependsOn: true } },
        dependents: { include: { task: true } }
      }
    });
    res.json(milestones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/progress', verifyToken, async (req, res) => {
  try {
    const { progress, status } = req.body;
    if (req.user.role === 'auditor') return res.status(403).json({ error: 'Unauthorized' });

    const milestone = await prisma.milestone.update({
      where: { id: req.params.id },
      data: { progress, status }
    });

    res.json(milestone);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
