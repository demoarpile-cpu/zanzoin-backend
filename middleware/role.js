const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }

        // Super admin always has access
        if (req.user.role === 'super_admin') {
            return next();
        }

        const normalizedUser = String(req.user.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        let effectiveRole = normalizedUser === 'operations' ? 'operation' : normalizedUser;
        // New tenant-facing aliases
        if (effectiveRole === 'business_client' || effectiveRole === 'client') effectiveRole = 'client';
        if (effectiveRole === 'saas_client') effectiveRole = 'admin';

        const allowed = allowedRoles.some((a) => effectiveRole === String(a).toLowerCase());
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
        }

        next();
    };
};

module.exports = { requireRole };
