const express = require('express');
const db = require('../db/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function withCounts(user, viewerId) {
  const followers_count = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(user.id).c;
  const following_count = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(user.id).c;
  const posts_count = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id = ?').get(user.id).c;

  let is_following = false;
  if (viewerId) {
    is_following = !!db.prepare(
      'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(viewerId, user.id);
  }

  return { ...publicUser(user), followers_count, following_count, posts_count, is_following };
}

// GET /api/users/:username  -> profile by username
router.get('/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: withCounts(user, req.user && req.user.id) });
});

// PUT /api/users/me -> update own profile
router.put('/me/update', requireAuth, (req, res) => {
  const { bio, avatar_url } = req.body || {};
  db.prepare('UPDATE users SET bio = COALESCE(?, bio), avatar_url = COALESCE(?, avatar_url) WHERE id = ?')
    .run(bio, avatar_url, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: withCounts(user, req.user.id) });
});

// POST /api/users/:id/follow
router.post('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot follow yourself.' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  try {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, targetId);
  } catch (err) {
    // already following - ignore (idempotent)
  }
  res.status(201).json({ following: true });
});

// DELETE /api/users/:id/follow
router.delete('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, targetId);
  res.json({ following: false });
});

// GET /api/users/:id/followers
router.get('/:id/followers', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio
    FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json({ followers: rows });
});

// GET /api/users/:id/following
router.get('/:id/following', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio
    FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json({ following: rows });
});

module.exports = router;
