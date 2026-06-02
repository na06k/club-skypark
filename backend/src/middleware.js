const jwt = require('jsonwebtoken');
const { store } = require('./db');
const { hasAnyPermission, hasPermission, normalizeStaffPermissions } = require('./permissions');

const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-this-secret-before-production') {
    console.warn('\x1b[33mWARNING: JWT_SECRET is not set in .env - using default. Change before going live.\x1b[0m');
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
    const decoded = jwt.verify(token, jwtSecret());
    const freshStaff = decoded.id ? store.find('staff', (staff) => String(staff.id) === String(decoded.id)) : null;
    if (freshStaff) {
      const { password_hash, ...safeStaff } = freshStaff;
      req.user = normalizeStaffPermissions(safeStaff);
    } else {
      req.user = normalizeStaffPermissions(decoded);
    }
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
