const jwt = require('jsonwebtoken');
const { store } = require('./db');
const { hasAnyPermission, hasPermission, normalizeStaffPermissions } = require('./permissions');

const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-this-secret-before-production') {
    // Production startup already refuses this (see config.js). Never fall back to a known secret there.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not configured.');
    }
    return 'change-this-secret-before-production';
  }
  return secret;
};

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    // The staff record in the database is the source of truth. A deleted/unknown account must lose access immediately.
    const freshStaff = decoded.id ? store.find('staff', (staff) => String(staff.id) === String(decoded.id)) : null;
    if (!freshStaff) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    const { password_hash, ...safeStaff } = freshStaff;
    req.user = normalizeStaffPermissions(safeStaff);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || (req.user.role !== 'super_admin' && !roles.includes(req.user.role))) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    return next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    return next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!hasAnyPermission(req.user, permissions)) {
      return res.status(403).json({ error: 'You do not have permission for this action.' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, requirePermission, requireAnyPermission, jwtSecret };
