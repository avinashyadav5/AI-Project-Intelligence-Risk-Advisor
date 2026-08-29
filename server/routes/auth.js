const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretfallbackkey';
const VALID_ROLES = ['pm', 'developer', 'auditor'];

if (!process.env.JWT_SECRET) {
  console.warn(
    'JWT_SECRET is not set — falling back to a well-known default. ' +
    'Set JWT_SECRET in your environment before deploying anywhere real.'
  );
}

/** Registration accepted anything at all, including a one-character password. */
function validateRegistration({ name, email, password }) {
  const errors = [];

  if (!name || String(name).trim().length < 2) {
    errors.push('Enter your name.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    errors.push('Enter a valid email address.');
  }
  if (!password || String(password).length < 8) {
    errors.push('Use a password of at least 8 characters.');
  } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push('Include at least one letter and one number in your password.');
  }

  return errors;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const errors = validateRegistration({ name, email, password });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const normalisedEmail = String(email).trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'An account already exists for that email address.' });
    }

    // Only the roles the product actually offers; 'admin' is never self-assignable.
    const requestedRole = VALID_ROLES.includes(role) ? role : 'developer';

    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalisedEmail,
        password: hashedPassword,
        role: requestedRole,
      },
    });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Enter your email address and password.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
    });

    // Same message either way, so the response cannot be used to discover
    // which email addresses have accounts.
    const invalid = () => res.status(401).json({ error: 'Incorrect email address or password.' });

    if (!user) return invalid();
    if (!(await bcrypt.compare(password, user.password))) return invalid();

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Could not sign you in.' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    res.json(user);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Could not load your account.' });
  }
});

module.exports = router;
