const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/companies
exports.getAll = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM companies ORDER BY created_at DESC');
        return successResponse(res, rows);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch companies.', 500);
    }
};

// GET /api/companies/:id
exports.getById = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return errorResponse(res, 'Company not found.', 404);
        return successResponse(res, rows[0]);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch company.', 500);
    }
};

// POST /api/companies
exports.create = async (req, res) => {
    try {
        const { name, email, phone, location, plan, billing_cycle, payment_method, contact_person, logo_url, tagline, source, status } = req.body;
        const [result] = await db.query(
            `INSERT INTO companies (name, email, phone, location, plan, billing_cycle, payment_method, contact_person, logo_url, tagline, source, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, email || null, phone || null, location || null, plan || 'Essentials', billing_cycle || 'Monthly', payment_method || null, contact_person || null, logo_url || null, tagline || null, source || null, status || 'active']
        );
        return successResponse(res, { id: result.insertId, name }, 'Company created.', 201);
    } catch (err) {
        return errorResponse(res, 'Failed to create company.', 500);
    }
};

// PUT /api/companies/:id
exports.update = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [];
        const values = [];
        for (const [key, val] of Object.entries(fields)) {
            if (key !== 'id' && key !== 'created_at') {
                sets.push(`${key} = ?`);
                values.push(val);
            }
        }
        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);
        values.push(req.params.id);
        await db.query(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, values);
        return successResponse(res, { id: req.params.id }, 'Company updated.');
    } catch (err) {
        return errorResponse(res, 'Failed to update company.', 500);
    }
};

// DELETE /api/companies/:id
exports.remove = async (req, res) => {
    try {
        await db.query('DELETE FROM companies WHERE id = ?', [req.params.id]);
        return successResponse(res, null, 'Company deleted.');
    } catch (err) {
        return errorResponse(res, 'Failed to delete company.', 500);
    }
};
