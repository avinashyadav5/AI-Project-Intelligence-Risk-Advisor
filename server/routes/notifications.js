const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/auth');

/**
 * Notifications and risk alerts.
 *
 * The Notification table existed in the schema with no route and no UI, and
 * critical-risk "alerts" were only ever a console.log. Both are now reachable:
 * the navbar bell reads from here, and alerts are queryable per project.
 */

// ── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const onlyUnread = req.query.unread === 'true';
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id, ...(onlyUnread ? { isRead: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Notification list error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { isRead: true },
    });
    if (count === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to update the notification.' });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch('/read-all', auth, async (req, res) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read.', updated: count });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

// ── GET /api/notifications/alerts/:projectId — risk alert history ────────────
router.get(
  '/alerts/:projectId',
  auth,
  requireProjectAccess(req => req.params.projectId),
  async (req, res) => {
    try {
      const alerts = await prisma.alertLog.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json(alerts);
    } catch (err) {
      console.error('Alert list error:', err);
      res.status(500).json({ error: 'Failed to fetch alerts.' });
    }
  }
);

module.exports = router;
