const prisma = require('../prismaClient');

/**
 * Activity + notification helpers.
 *
 * The ActivityLog and Notification tables existed in the schema but nothing
 * ever wrote to them, so the "live activity" feed was hardcoded placeholder
 * text and the notification bell did nothing. Everything that matters now
 * routes through here.
 *
 * All helpers swallow their own errors: an audit trail must never be the
 * reason an upload or an analysis fails.
 */

async function logActivity(projectId, userId, action, details = {}) {
  if (!projectId || !action) return null;
  try {
    return await prisma.activityLog.create({
      data: { projectId, userId: userId || null, action, details },
    });
  } catch (err) {
    console.warn('Activity log failed:', err.message);
    return null;
  }
}

/** Everyone attached to a project: its owner plus every member. */
async function projectRecipients(projectId) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { select: { userId: true } } },
    });
    if (!project) return [];
    const ids = new Set(project.members.map(m => m.userId));
    if (project.ownerId) ids.add(project.ownerId);
    return [...ids];
  } catch (err) {
    console.warn('Could not resolve notification recipients:', err.message);
    return [];
  }
}

async function notifyUsers(userIds, { projectId, type, message, link }) {
  const targets = [...new Set(userIds || [])].filter(Boolean);
  if (targets.length === 0) return 0;
  try {
    await prisma.notification.createMany({
      data: targets.map(userId => ({
        userId,
        projectId: projectId || null,
        type,
        message,
        link: link || null,
      })),
    });
    return targets.length;
  } catch (err) {
    console.warn('Notification create failed:', err.message);
    return 0;
  }
}

/** Notify the whole project team. Used for risk alerts and completed analyses. */
async function notifyProject(projectId, { type, message, link, excludeUserId }) {
  const recipients = (await projectRecipients(projectId))
    .filter(id => id !== excludeUserId);
  return notifyUsers(recipients, { projectId, type, message, link });
}

/**
 * Record a point on the project's health timeline.
 * Feeds the trend chart, which previously had no data source at all.
 */
async function recordHealthSnapshot(projectId, { health, riskScore }) {
  try {
    const breakdown = (health && health.breakdown) || {};
    const axis = name => {
      const entry = breakdown[name];
      return entry && typeof entry.score === 'number' ? Math.round(entry.score) : 0;
    };
    return await prisma.projectHealthHistory.create({
      data: {
        projectId,
        planningScore: axis('planning'),
        docsScore: axis('documentation'),
        devScore: axis('development'),
        testScore: axis('testing'),
        riskScore: typeof riskScore === 'number' ? Math.round(riskScore) : 0,
        overallScore: health && typeof health.score === 'number' ? Math.round(health.score) : 0,
      },
    });
  } catch (err) {
    console.warn('Health snapshot failed:', err.message);
    return null;
  }
}

module.exports = {
  logActivity,
  notifyUsers,
  notifyProject,
  projectRecipients,
  recordHealthSnapshot,
};
