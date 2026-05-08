const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }

        // Normalize user role first — before any checks
        const normalizedUser = String(req.user.role || '').toLowerCase().trim().replace(/\s+/g, '_');

        // Super admin always has access (handle both 'super_admin' and 'superadmin')
        if (normalizedUser === 'super_admin' || normalizedUser === 'superadmin') {
            return next();
        }

        let effectiveRole = normalizedUser;
        // Tenant-facing aliases
        if (effectiveRole === 'business_client') effectiveRole = 'client';
        if (effectiveRole === 'saas_client') effectiveRole = 'admin';

        const allowed = allowedRoles.some((a) => effectiveRole === String(a).toLowerCase());
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
        }

        next();
    };
};

module.exports = { requireRole };
