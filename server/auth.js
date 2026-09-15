const crypto = require('crypto');

// Single shared secret: both phones use the same APP_TOKEN (no per-user
// accounts, all data is shared). Applied to every /api/* route except
// /api/health, which is mounted before this middleware.

function constantTimeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; compare against itself to keep timing flat.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAuth(req, res, next) {
  const configured = process.env.APP_TOKEN;
  if (!configured) {
    console.error('APP_TOKEN is not set; refusing all API requests');
    return res.status(503).json({ error: 'Server not configured' });
  }
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !constantTimeEqual(token, configured)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

module.exports = { requireAuth };
