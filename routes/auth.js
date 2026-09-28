const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password, bio } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'username must be 3-30 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already in use.' });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)'
  ).run(username, email, password_hash, bio || '');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
