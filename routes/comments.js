const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// DELETE /api/comments/:id -> only the author can delete
router.delete('/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Not your comment.' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
