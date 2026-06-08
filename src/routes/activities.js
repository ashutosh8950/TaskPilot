const express = require('express');
const db      = require('../db');
const authMW  = require('../middleware/auth');

const router = express.Router();
router.use(authMW);

// GET /api/activities
router.get('/', async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM activities ORDER BY created_at DESC LIMIT 30'
    );
    res.json(r.rows.map(a => ({
      id: a.id, text: a.text, created_at: a.created_at
    })));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
