const express = require('express');
const db = require('../db/database');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function hydratePost(post, viewerId) {
  const author = db.prepare('SELECT id, username, avatar_url FROM users WHERE id = ?').get(post.user_id);
  const likes_count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(post.id).c;
  const comments_count = db.prepare('SELECT COUNT(*) c FROM comments WHERE post_id = ?').get(post.id).c;

  let liked_by_me = false;
  if (viewerId) {
    liked_by_me = !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, viewerId);
  }

  return { ...post, author, likes_count, comments_count, liked_by_me };
}

// GET /api/posts -> feed. ?scope=following restricts to people the viewer follows.
router.get('/', optionalAuth, (req, res) => {
  let rows;
  if (req.query.scope === 'following' && req.user) {
    rows = db.prepare(`
      SELECT p.* FROM posts p
      WHERE p.user_id = ?
         OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all(req.user.id, req.user.id);
  } else if (req.query.user_id) {
    rows = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(req.query.user_id);
  } else {
    rows = db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50').all();
  }

  const posts = rows.map((p) => hydratePost(p, req.user && req.user.id));
  res.json({ posts });
});

// POST /api/posts -> create a post
router.post('/', requireAuth, (req, res) => {
  const { content, image_url } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required.' });
  }
  const info = db.prepare('INSERT INTO posts (user_id, content, image_url) VALUES (?, ?, ?)')
    .run(req.user.id, content.trim(), image_url || '');
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ post: hydratePost(post, req.user.id) });
});

// GET /api/posts/:id -> single post
router.get('/:id', optionalAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  res.json({ post: hydratePost(post, req.user && req.user.id) });
});

// DELETE /api/posts/:id -> only the author can delete
router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not your post.' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// POST /api/posts/:id/like
router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  try {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
  } catch (err) {
    // already liked - ignore (idempotent)
  }
  const likes_count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.status(201).json({ liked: true, likes_count });
});

// DELETE /api/posts/:id/like
router.delete('/:id/like', requireAuth, (req, res) => {
  db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  const likes_count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: false, likes_count });
});

// GET /api/posts/:id/comments
router.get('/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.username, u.avatar_url
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ comments: rows });
});

// POST /api/posts/:id/comments
router.post('/:id/comments', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required.' });
  }

  const info = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar_url
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({ comment });
});

module.exports = router;
