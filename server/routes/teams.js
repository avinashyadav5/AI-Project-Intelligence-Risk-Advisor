const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');
const { requireProjectAccess, requireRole } = require('../middleware/auth');
const events = require('../utils/events');

/**
 * Team membership and invites.
 *
 * This file used to carry its own copy of the token check; it now uses the
 * shared auth middleware so there is one place where authentication changes.
 */

// ── POST /api/teams/invite ───────────────────────────────────────────────────
router.post(
  '/invite',
  auth,
  requireProjectAccess(req => req.body.projectId),
  requireRole('pm'),
  async (req, res) => {
    try {
      const { projectId, email, role } = req.body;
      if (!email) return res.status(400).json({ error: 'An email address is required.' });

      const validRoles = ['pm', 'developer', 'auditor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}.` });
      }

      const normalisedEmail = String(email).trim().toLowerCase();

      const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
      if (existing) {
        const alreadyMember = await prisma.projectMembers.findUnique({
          where: { projectId_userId: { projectId, userId: existing.id } },
        });
        if (alreadyMember) {
          return res.status(409).json({ error: 'That person is already on this project.' });
        }
      }

      const token = crypto.randomBytes(20).toString('hex');
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 7);

      await prisma.invite.create({
        data: { projectId, email: normalisedEmail, role, token, createdBy: req.user.id, expiry },
      });

      // In-app notification for an existing user; the link is still shareable
      // for people who haven't registered yet.
      if (existing) {
        await events.notifyUsers([existing.id], {
          projectId,
          type: 'invite',
          message: `You have been invited to join "${req.project.name}" as a ${role}.`,
          link: `/join?token=${token}`,
        });
      }

      await events.logActivity(projectId, req.user.id, 'member.invited', { email: normalisedEmail, role });

      res.json({
        message: 'Invite created.',
        inviteLink: `/join?token=${token}`,
        notifiedExistingUser: Boolean(existing),
      });
    } catch (err) {
      console.error('Invite error:', err);
      res.status(500).json({ error: 'Failed to create the invite.' });
    }
  }
);

// ── POST /api/teams/join ─────────────────────────────────────────────────────
router.post('/join', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'An invite token is required.' });

    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) return res.status(404).json({ error: 'That invite link is not valid.' });
    if (invite.used) return res.status(400).json({ error: 'That invite has already been used.' });
    if (new Date() > invite.expiry) return res.status(400).json({ error: 'That invite has expired.' });

    // The email check was commented out, which let anyone holding the link join
    // any project. An invite is now only redeemable by the person it names.
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    if (!me || me.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({
        error: `This invite was sent to ${invite.email}. Sign in with that account to accept it.`,
      });
    }

    const alreadyMember = await prisma.projectMembers.findUnique({
      where: { projectId_userId: { projectId: invite.projectId, userId: req.user.id } },
    });

    if (!alreadyMember) {
      await prisma.projectMembers.create({
        data: { projectId: invite.projectId, userId: req.user.id, role: invite.role },
      });
    }

    await prisma.invite.update({ where: { id: invite.id }, data: { used: true } });
    await events.logActivity(invite.projectId, req.user.id, 'member.joined', { role: invite.role });

    res.json({ message: 'You have joined the project.', projectId: invite.projectId });
  } catch (err) {
    console.error('Join error:', err);
    res.status(500).json({ error: 'Failed to join the project.' });
  }
});

// ── GET /api/teams/:projectId — member list ──────────────────────────────────
router.get('/:projectId', auth, requireProjectAccess(req => req.params.projectId), async (req, res) => {
  try {
    const members = await prisma.projectMembers.findMany({
      where: { projectId: req.params.projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const pendingInvites = await prisma.invite.findMany({
      where: { projectId: req.params.projectId, used: false, expiry: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiry: true, createdAt: true },
    });

    res.json({
      members: members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        name: m.user?.name,
        email: m.user?.email,
        isOwner: req.project.ownerId === m.userId,
      })),
      pendingInvites,
    });
  } catch (err) {
    console.error('Member list error:', err);
    res.status(500).json({ error: 'Failed to fetch team members.' });
  }
});

// ── DELETE /api/teams/:projectId/members/:userId ─────────────────────────────
router.delete(
  '/:projectId/members/:userId',
  auth,
  requireProjectAccess(req => req.params.projectId),
  requireRole('pm'),
  async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      if (req.project.ownerId === userId) {
        return res.status(400).json({ error: 'The project owner cannot be removed.' });
      }

      await prisma.projectMembers.delete({
        where: { projectId_userId: { projectId, userId } },
      });
      await events.logActivity(projectId, req.user.id, 'member.removed', { removedUserId: userId });

      res.json({ message: 'Member removed.' });
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'That person is not on this project.' });
      console.error('Remove member error:', err);
      res.status(500).json({ error: 'Failed to remove the member.' });
    }
  }
);

module.exports = router;
