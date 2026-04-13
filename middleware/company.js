// Multi-tenant middleware: scopes all queries by company_id
const scopeByCompany = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    // Super admin can access all companies — no scoping
    if (req.user.role === 'super_admin') {
        req.companyScope = null; // null means no filter
    } else {
        // All other roles are scoped to their company
        if (!req.user.company_id) {
            return res.status(403).json({ success: false, message: 'No company associated with this user.' });
        }
        req.companyScope = req.user.company_id;
    }

    next();
};

// Helper: builds WHERE clause for company scoping
const companyFilter = (req, alias = '') => {
    const prefix = alias ? `${alias}.` : '';
    if (req.companyScope === null) {
        return { clause: '', params: [] };
    }
    return { clause: ` AND ${prefix}company_id = ?`, params: [req.companyScope] };
};

// Helper: builds AND company_id = ? clause for single-record operations (getById, update, delete)
// Super admin bypasses (companyScope is null)
const companyScope = (req, alias = '') => {
    const prefix = alias ? `${alias}.` : '';
    if (!req.companyScope) return { clause: '', params: [] };
    return { clause: ` AND ${prefix}company_id = ?`, params: [req.companyScope] };
};

module.exports = { scopeByCompany, companyFilter, companyScope };
