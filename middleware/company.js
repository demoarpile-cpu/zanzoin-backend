// Multi-tenant middleware: scopes all queries by company_id
// company_id = tenant_id in this system
const scopeByCompany = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const roleNorm = String(req.user.role || '').toLowerCase().replace(/\s+/g, '');

    // Super admin sees everything — no tenant scoping (JWT may use superadmin or super_admin)
    if (roleNorm === 'super_admin' || roleNorm === 'superadmin') {
        req.companyScope = null;
        req.isSuperAdmin = true;
        return next();
    }

    // Customer role: no company, scoped by user ID in controllers
    if (roleNorm === 'customer' || roleNorm === 'client') {
        req.companyScope = null;
        req.isCustomer = true;
        return next();
    }

    // Internal roles without company_id → default to ZaneZion HQ (null)
    const internalRoles = ['admin', 'operation', 'procurement', 'inventory', 'logistics', 'concierge', 'staff', 'finance'];
    if (internalRoles.includes(roleNorm) && !req.user.company_id) {
        req.companyScope = null;
        req.tenantId = null;
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
