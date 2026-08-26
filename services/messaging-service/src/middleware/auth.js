const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Messaging participation is the authorisation (per the EERD security section):
// every route below trusts req.userId, taken only from a signed token issued by
// auth-service, never from a client-supplied body/query field.
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  try {
    const payload = jwt.verify(token, env.jwt.signingKey, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      // Pin the algorithm rather than relying on the library's key-type inference, so this
      // cannot become an algorithm-confusion foothold if the key handling ever changes.
      algorithms: ['HS256'],
    });
    req.userId = payload.sub;
    if (!req.userId) {
      return res.status(401).json({ error: 'Token has no subject claim.' });
    }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
