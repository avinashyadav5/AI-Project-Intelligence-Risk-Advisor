const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess, requireRole } = require('../middleware/auth');
const events = require('../utils/events');

/**
 * Milestones and their dependencies.
 *
 * The dependency graph was being stored but never returned in a usable shape,
 * so the UI could not show what blocks what. Every response now carries the
 * resolved dependency names plus a computed `isBlocked` flag, and the same
 * records feed the deterministic schedule forecast.
 */

const VALID_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked'];

/** A task is blocked if it says so, or if anything it depends on is unfinished. */
function decorate(milestone) {
  const dependsOn = (milestone.dependencies || []).map(d => ({
    id: d.dependsOn?.id,
    name: d.dependsOn?.name,
    status: d.dependsOn?.status,
  })).filter(d => d.id);

  const blockedBy = dependsOn.filter(d => d.status !== 'completed');

  return {
    ...milestone,
    dependsOn,
    blockedBy,
    isBlocked: milestone.status === 'blocked' || blockedBy.length > 0,
    isOverdue:
      Boolean(milestone.dueDate) &&
      milestone.status !== 'completed' &&
      new Date(milestone.dueDate) < new Date(),
  };
}

const includeGraph = {
  dependencies: { include: { dependsOn: { select: { id: true, name: true, status: true } } } },
  dependents: { include: { task: { select: { id: true, name: true, status: true } } } },
};

// ── POST /api/milestones ─────────────────────────────────────────────────────
router.post(
  '/',
  auth,
  requireProjectAccess(req => req.body.projectId),
  requireRole('pm', 'developer'),
  async (req, res) => {
    try {
      const { projectId, name, description, dueDate, startDate, owner, effort, dependencies } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'A task name is required.' });
      }

      const milestone = await prisma.milestone.create({
        data: {
          projectId,
          name: String(name).trim(),
          description: description || null,
          owner: owner || null,
          effort: effort || null,
          startDate: startDate ? new Date(startDate) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      });

      if (Array.isArray(dependencies) && dependencies.length > 0) {
        await prisma.taskDependency.createMany({
          data: dependencies
            .filter(depId => depId && depId !== milestone.id)
            .map(depId => ({ taskId: milestone.id, dependsOnId: depId })),
          skipDuplicates: true,
        });
      }

      await events.logActivity(projectId, req.user.id, 'task.created', {
        milestoneId: milestone.id,
        name: milestone.name,
      });

      const created = await prisma.milestone.findUnique({
        where: { id: milestone.id },
        include: includeGraph,
      });
      res.status(201).json(decorate(created));
    } catch (err) {
      console.error('Create milestone error:', err);
      res.status(500).json({ error: 'Failed to create the task.' });
    }
  }
);

// ── GET /api/milestones/:projectId ───────────────────────────────────────────
router.get('/:projectId', auth, requireProjectAccess(req => req.params.projectId), async (req, res) => {
  try {
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      include: includeGraph,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(milestones.map(decorate));
  } catch (err) {
    console.error('List milestones error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
});

// ── PATCH /api/milestones/:id/progress ───────────────────────────────────────
router.patch(
  '/:id/progress',
  auth,
  requireProjectAccess(async (req) => {
    const m = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    return m?.projectId;
  }),
  requireRole('pm', 'developer'),
  async (req, res) => {
    try {
      const { progress, status } = req.body;

      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });
      }

      const data = {};
      if (typeof progress === 'number') data.progress = Math.max(0, Math.min(100, progress));
      if (status) {
        data.status = status;
        // Keep progress and status consistent so the schedule engine and the
        // board never disagree about whether a task is finished.
        if (status === 'completed') data.progress = 100;
        if (status === 'not_started' && data.progress === undefined) data.progress = 0;
      }

      await prisma.milestone.update({ where: { id: req.params.id }, data });

      const updated = await prisma.milestone.findUnique({
        where: { id: req.params.id },
        include: includeGraph,
      });

      await events.logActivity(updated.projectId, req.user.id, 'task.updated', {
        milestoneId: updated.id,
        name: updated.name,
        status: updated.status,
        progress: updated.progress,
      });

      res.json(decorate(updated));
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found.' });
      console.error('Update milestone error:', err);
      res.status(500).json({ error: 'Failed to update the task.' });
    }
  }
);

// ── DELETE /api/milestones/:id ───────────────────────────────────────────────
router.delete(
  '/:id',
  auth,
  requireProjectAccess(async (req) => {
    const m = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      select: { projectId: true },
    });
    return m?.projectId;
  }),
  requireRole('pm', 'developer'),
  async (req, res) => {
    try {
      const deleted = await prisma.milestone.delete({ where: { id: req.params.id } });
      await events.logActivity(deleted.projectId, req.user.id, 'task.deleted', { name: deleted.name });
      res.json({ message: 'Task deleted.', id: deleted.id });
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found.' });
      console.error('Delete milestone error:', err);
      res.status(500).json({ error: 'Failed to delete the task.' });
    }
  }
);

module.exports = router;
