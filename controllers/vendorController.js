const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM vendors WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch vendors.', 500); }
};

exports.create = async (req, res) => {
    try {
        const { name, email, phone, contact_name, category, location } = req.body;
        const companyId = req.body.company_id || req.companyScope;
        const [result] = await db.query(
            `INSERT INTO vendors (company_id, name, email, phone, contact_name, category, location) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, email || null, phone || null, contact_name || null, category || null, location || null]
        );
        return successResponse(res, { id: result.insertId, name }, 'Vendor created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create vendor.', 500); }
};

exports.update = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        for (const [key, val] of Object.entries(fields)) {
            if (['id', 'created_at', 'company_id'].includes(key)) continue;
            sets.push(`${key} = ?`); values.push(val);
        }
        if (sets.length === 0) return errorResponse(res, 'No fields.', 400);
        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE vendors SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Vendor updated.');
    } catch (err) { return errorResponse(res, 'Failed to update vendor.', 500); }
};

exports.remove = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM vendors WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Vendor deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete vendor.', 500); }
};
