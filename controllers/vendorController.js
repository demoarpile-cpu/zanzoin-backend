const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

/** UI sends 0–100 (percent); DB stores DECIMAL(5,2). */
function clampPercentMetric(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, n));
}

function isSuperAdminRole(userOrRole) {
    const role = typeof userOrRole === 'object' ? userOrRole.role : userOrRole;
    const r = String(role || '').trim().toLowerCase().replace(/\s+/g, '_');
    return r === 'super_admin' || r === 'superadmin';
}

// GET /api/vendors
exports.getAll = async (req, res) => {
    try {
        const normalizePositiveInt = (val) => {
            if (val == null || val === '') return null;
            const n = Number(val);
            if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
            return Math.trunc(n);
        };

        // Super admin sees all vendors across companies.
        if (isSuperAdminRole(req.user?.role)) {
            const [rows] = await db.query(
                `SELECT *, location AS address FROM vendors ORDER BY created_at DESC`
            );
            return successResponse(res, rows);
        }

        // Keep tenant-scoped view, but recover when middleware scope points to non-existent company.
        const fallbackCompanyId = normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);
        let companyId =
            normalizePositiveInt(req.companyScope) ||
            normalizePositiveInt(req.user?.company_id) ||
            fallbackCompanyId;

        if (companyId) {
            const [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);
            if (!companyRows.length) companyId = null;
        }
        if (!companyId) {
            const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
            if (anyCompany.length) companyId = anyCompany[0].id;
        }

        if (!companyId) return successResponse(res, []);

        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);

        if (roleNorm === 'admin' && isHQ) {
            const [rows] = await db.query(
                `SELECT *, location AS address FROM vendors WHERE (company_id = ? OR company_id IS NULL) AND created_by = ? ORDER BY created_at DESC`,
                [companyId || 1, req.user.id]
            );
            return successResponse(res, rows);
        }

        const [rows] = await db.query(
            `SELECT *, location AS address FROM vendors WHERE company_id = ? ORDER BY created_at DESC`,
            [companyId]
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch vendors.', 500); }
};

// POST /api/vendors
exports.create = async (req, res) => {
    try {
        const { name, email, phone, contact_name, contact, category, rating, delivery } = req.body;
        if (!name || !String(name).trim()) {
            return errorResponse(res, 'Vendor name is required.', 400);
        }
        // Accept both 'address' and 'location' from frontend
        const location = req.body.location || req.body.address || null;
        const normalizePositiveInt = (val) => {
            if (val == null || val === '') return null;
            const n = Number(val);
            if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
            return Math.trunc(n);
        };

        const requestedCompanyId = normalizePositiveInt(req.body.company_id);
        const scopedCompanyId = normalizePositiveInt(req.companyScope);
        const fallbackCompanyId = normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);
        let companyId = requestedCompanyId || scopedCompanyId || fallbackCompanyId;

        if (!companyId) {
            return errorResponse(res, 'Valid company_id is required to create vendor.', 400);
        }

        let [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);
        
        // --- EMERGENCY HEALING: If no companies exist and user is platform admin, create HQ company ---
        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isPlatformAdmin = roleNorm === 'super_admin' || roleNorm === 'admin';

        if (!companyRows.length && isPlatformAdmin) {
            const [allCompanies] = await db.query('SELECT id FROM companies LIMIT 1');
            if (allCompanies.length === 0) {
                console.log("Emergency: No companies found in Vendor Create. Creating HQ Company.");
                const [hqResult] = await db.query(
                    `INSERT INTO companies (id, name, email, plan, status) VALUES (1, 'ZaneZion HQ', 'hq@zanezion.com', 'Enterprise', 'active')`
                );
                companyId = hqResult.insertId || 1;
                companyRows = [{ id: companyId }];
            } else {
                const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
                if (anyCompany.length) {
                    companyId = anyCompany[0].id;
                    companyRows = anyCompany;
                }
            }
        }

        if (!companyRows.length) {
            return errorResponse(res, 'Invalid company_id. Company not found. Please create a company first.', 400);
        }

        const ratingVal = clampPercentMetric(rating);
        const deliveryVal = clampPercentMetric(delivery);
        // Approval flow: all new vendors start as pending (stored as inactive).
        // Only super admin should later set them to active.
        const safeStatus = 'inactive';

        const [result] = await db.query(
            `INSERT INTO vendors (company_id, name, email, phone, contact_name, category, location, rating, delivery, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                String(name).trim(),
                email  || null,
                phone  || null,
                contact_name || contact || null,
                category || null,
                location,
                ratingVal,
                deliveryVal,
                safeStatus,
                req.user.id
            ]
        );
        return successResponse(res, { id: result.insertId, name: String(name).trim(), status: safeStatus }, 'Vendor created.', 201);
    } catch (err) {
        console.error('Create vendor error:', err);
        return errorResponse(res, `Failed to create vendor. ${err.sqlMessage || err.message || ''}`.trim(), 500);
    }
};

// PUT /api/vendors/:id
exports.update = async (req, res) => {
    try {
        // Only update valid DB columns — reject frontend-only fields
        const allowed = ['name', 'email', 'phone', 'contact_name', 'category', 'location', 'rating', 'delivery', 'status'];
        const sets = [];
        const values = [];

        const body = { ...req.body };
        // address → location (always prefer non-empty address)
        if (body.address) body.location = body.address;
        // contact → contact_name
        if (body.contact && !body.contact_name) body.contact_name = body.contact;

        for (const [key, val] of Object.entries(body)) {
            if (!allowed.includes(key)) continue;
            let v = val === '' ? null : val;
            if ((key === 'rating' || key === 'delivery') && v != null) {
                v = clampPercentMetric(v);
            }
            if (key === 'status') {
                const statusNorm = String(v || '').toLowerCase().trim();
                if (!isSuperAdminRole(req.user?.role)) {
                    // Tenant admins/procurement cannot self-approve vendors.
                    if (statusNorm === 'active' || statusNorm === 'blacklisted') {
                        return errorResponse(res, 'Only super admin can approve or blacklist vendors.', 403);
                    }
                    // Keep non-super-admin updates in pending state.
                    v = 'inactive';
                } else {
                    if (!['active', 'inactive', 'blacklisted'].includes(statusNorm)) {
                        return errorResponse(res, 'Invalid vendor status.', 400);
                    }
                    v = statusNorm;
                }
            }
            sets.push(`${key} = ?`);
            values.push(v);
        }

        if (sets.length === 0) return errorResponse(res, 'No valid fields to update.', 400);
        
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin) {
            cs = { clause: '', params: [] };
        } else if (isHQ) {
            cs = { clause: ' AND created_by = ?', params: [req.user.id] };
        } else {
            cs = companyScope(req);
        }

        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Vendor updated.');
    } catch (err) {
        console.error('Update vendor error:', err.message);
        return errorResponse(res, 'Failed to update vendor.', 500);
    }
};

// DELETE /api/vendors/:id
exports.remove = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(`DELETE FROM vendors WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Vendor deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete vendor.', 500); }
};
