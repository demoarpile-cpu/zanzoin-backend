// Multi-tenant middleware: scopes all queries by company_id
// company_id = tenant_id in this system
const scopeByCompany = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    // Super admin sees everything — no tenant scoping
    if (req.user.role === 'super_admin') {
        req.companyScope = null;
        req.isSuperAdmin = true;
        return next();
    }

    // Customer role: no company, scoped by user ID in controllers
    if (req.user.role === 'customer') {
        req.companyScope = null;
        req.isCustomer = true;
        return next();
    }

    // Admin role without company_id → default to ZaneZion HQ (id=1)
    if (req.user.role === 'admin' && !req.user.company_id) {
        req.companyScope = 1;
        req.tenantId = 1;
        return next();
    }

    // All other tenant roles must have company_id
    if (!req.user.company_id) {
        return res.status(403).json({ success: false, message: 'No tenant associated with this user.' });
    }

    req.companyScope = req.user.company_id;
    req.tenantId = req.user.company_id;
    next();
};

// Build WHERE clause for tenant-scoped queries
const companyFilter = (req, alias = '') => {
    const prefix = alias ? `${alias}.` : '';
    if (req.companyScope === null || req.companyScope === undefined) {
        return { clause: '', params: [] };
    }
    return { clause: ` AND ${prefix}company_id = ?`, params: [req.companyScope] };
};

// Build WHERE clause for single-record ops (getById, update, delete)
const companyScope = (req, alias = '') => {
    const prefix = alias ? `${alias}.` : '';
    if (!req.companyScope) return { clause: '', params: [] };
    return { clause: ` AND ${prefix}company_id = ?`, params: [req.companyScope] };
};

module.exports = { scopeByCompany, companyFilter, companyScope };
