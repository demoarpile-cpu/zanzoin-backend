const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }

        // Super admin always has access
        if (req.user.role === 'super_admin') {
            return next();
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
        }

        next();
    };
};

module.exports = { requireRole };
