const jwt = require('jsonwebtoken');
const db = require('../db');
const { config } = require('../config');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);
    const { rows } = await db.query(
      'SELECT id, name, email, role, token_version FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (Number(decoded.tokenVersion ?? 0) !== Number(rows[0].token_version ?? 0)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.user = rows[0];
    return next();
  } catch (err) {
    if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(err.name)) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error(err);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
};
