const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfallbackkey';

/**
 * Verify the bearer token and attach { id, role } to req.user.
 *
 * A 401 is returned for both a missing and an invalid token — a malformed
 * token is an authentication failure, not a bad request, and the client's
 * interceptor redirects to /login on 401.
 */
function auth(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (ex) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/** Restrict a route to specific roles. Admins always pass. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({
      error: `This action requires one of these roles: ${roles.join(', ')}.`,
    });
  };
}

/**
 * Confirm the caller can see this project before any document, chat or upload
 * operation touches it.
 *
 * Upload, documents and chat previously had no auth at all, so any caller who
 * knew a project id could read every risk report and query the knowledge base.
 *
 * `resolveProjectId` pulls the id from wherever the route keeps it.
 */
function requireProjectAccess(resolveProjectId) {
  return async (req, res, next) => {
    try {
      const projectId = await resolveProjectId(req);
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required.' });
      }

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { select: { userId: true } } },
      });

      if (!project) return res.status(404).json({ error: 'Project not found.' });

      const isAdmin = req.user.role === 'admin';
      const isOwner = project.ownerId === req.user.id;
      const isMember = project.members.some(m => m.userId === req.user.id);

      if (!isAdmin && !isOwner && !isMember) {
        return res.status(403).json({ error: 'You do not have access to this project.' });
      }

      req.project = project;
      req.projectId = projectId;
      next();
    } catch (err) {
      console.error('Project access check failed:', err);
      res.status(500).json({ error: 'Could not verify project access.' });
    }
  };
}

module.exports = auth;
module.exports.auth = auth;
module.exports.requireRole = requireRole;
module.exports.requireProjectAccess = requireProjectAccess;
