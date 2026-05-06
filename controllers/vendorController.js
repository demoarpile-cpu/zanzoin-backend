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

// GET /api/vendors
exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(
            `SELECT *, location AS address FROM vendors WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`,
            cf.params
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
        if (!companyRows.length && scopedCompanyId) {
            const [scopedRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [scopedCompanyId]);
            if (scopedRows.length) {
                companyId = scopedCompanyId;
                companyRows = scopedRows;
            }
        }
        if (!companyRows.length && fallbackCompanyId) {
            const [fallbackRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [fallbackCompanyId]);
            if (fallbackRows.length) {
                companyId = fallbackCompanyId;
                companyRows = fallbackRows;
            }
        }
        if (!companyRows.length) {
            const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
            if (anyCompany.length) {
                companyId = anyCompany[0].id;
                companyRows = anyCompany;
            }
        }
        if (!companyRows.length) {
            return errorResponse(res, 'Invalid company_id. Company not found.', 400);
        }

        const ratingVal = clampPercentMetric(rating);
        const deliveryVal = clampPercentMetric(delivery);

        const [result] = await db.query(
            `INSERT INTO vendors (company_id, name, email, phone, contact_name, category, location, rating, delivery)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                String(name).trim(),
                email  || null,
                phone  || null,
                contact_name || contact || null,
                category || null,
                location,
                ratingVal,
                deliveryVal
            ]
        );
        return successResponse(res, { id: result.insertId, name: String(name).trim() }, 'Vendor created.', 201);
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
            sets.push(`${key} = ?`);
            values.push(v);
        }

        if (sets.length === 0) return errorResponse(res, 'No valid fields to update.', 400);

        const cs = companyScope(req);
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
        const cs = companyScope(req);
        await db.query(`DELETE FROM vendors WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Vendor deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete vendor.', 500); }
};
