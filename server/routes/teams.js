const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const verifyToken = async (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretfallbackkey');
    req.user = decoded;
    next();
  } catch(err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/invite', verifyToken, async (req, res) => {
  try {
    const { projectId, email, role } = req.body;
    
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    
    if (req.user.role !== 'admin' && req.user.role !== 'pm') {
        return res.status(403).json({ error: 'Only PMs and Admins can invite members' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    const invite = await prisma.invite.create({
      data: {
        projectId,
        email,
        role,
        token,
        createdBy: req.user.id,
        expiry
      }
    });

    console.log(`[SIMULATED EMAIL] Invite sent to ${email} for project ${projectId}. Token: ${token}`);

    res.json({ message: 'Invite created successfully', inviteLink: `/join?token=${token}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/join', verifyToken, async (req, res) => {
  try {
    const { token } = req.body;
    
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) return res.status(404).json({ error: 'Invalid invite token' });
    if (invite.used) return res.status(400).json({ error: 'Invite already used' });
    if (new Date() > invite.expiry) return res.status(400).json({ error: 'Invite expired' });

    // Allow any logged-in user with the valid token to join (common invite link pattern)
    // if (req.user.email !== invite.email) {
    //   return res.status(403).json({ error: 'Invite was sent to a different email address' });
    // }

    await prisma.projectMembers.create({
      data: {
        projectId: invite.projectId,
        userId: req.user.id,
        role: invite.role
      }
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { used: true }
    });

    res.json({ message: 'Successfully joined project', projectId: invite.projectId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const members = await prisma.projectMembers.findMany({
      where: { projectId: req.params.projectId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
