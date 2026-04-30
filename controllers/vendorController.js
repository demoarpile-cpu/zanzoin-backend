const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

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
        const { name, email, phone, contact_name, contact, category, rating } = req.body;
        // Accept both 'address' and 'location' from frontend
        const location = req.body.location || req.body.address || null;
        const companyId = req.body.company_id || req.companyScope;

        const [result] = await db.query(
            `INSERT INTO vendors (company_id, name, email, phone, contact_name, category, location, rating)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId,
                name,
                email  || null,
                phone  || null,
                contact_name || contact || null,
                category || null,
                location,
                rating || 0
            ]
        );
        return successResponse(res, { id: result.insertId, name }, 'Vendor created.', 201);
    } catch (err) {
        console.error('Create vendor error:', err.message);
        return errorResponse(res, 'Failed to create vendor.', 500);
    }
};

// PUT /api/vendors/:id
exports.update = async (req, res) => {
    try {
        // Only update valid DB columns — reject frontend-only fields
        const allowed = ['name', 'email', 'phone', 'contact_name', 'category', 'location', 'rating', 'status'];
        const sets = [];
        const values = [];

        const body = { ...req.body };
        // address → location (always prefer non-empty address)
        if (body.address) body.location = body.address;
        // contact → contact_name
        if (body.contact && !body.contact_name) body.contact_name = body.contact;

        for (const [key, val] of Object.entries(body)) {
            if (!allowed.includes(key)) continue;
            sets.push(`${key} = ?`);
            values.push(val === '' ? null : val);
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
