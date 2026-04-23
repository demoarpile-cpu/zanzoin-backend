const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generatePassword, successResponse, errorResponse } = require('../utils/helpers');
const { sendMail } = require('../utils/mailer');

// --- PLANS ---
exports.getPlans = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM saas_plans ORDER BY price ASC');
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch plans.', 500); }
};

exports.createPlan = async (req, res) => {
    try {
        const { name, price, billing_cycle, features, max_users, max_orders } = req.body;
        const [result] = await db.query(
            `INSERT INTO saas_plans (name, price, billing_cycle, features, max_users, max_orders) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, price, billing_cycle || 'Monthly', JSON.stringify(features || []), max_users || 10, max_orders || 100]
        );
        return successResponse(res, { id: result.insertId }, 'Plan created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create plan.', 500); }
};

exports.updatePlan = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['id', 'created_at'].includes(k)) continue;
            sets.push(`${k} = ?`); values.push(k === 'features' ? JSON.stringify(v) : v);
        }
        values.push(req.params.id);
        await db.query(`UPDATE saas_plans SET ${sets.join(', ')} WHERE id = ?`, values);
        return successResponse(res, { id: req.params.id }, 'Plan updated.');
    } catch (err) { return errorResponse(res, 'Failed to update plan.', 500); }
};

exports.deletePlan = async (req, res) => {
    try {
        await db.query('DELETE FROM saas_plans WHERE id = ?', [req.params.id]);
        return successResponse(res, null, 'Plan deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete plan.', 500); }
};

// --- SUBSCRIPTION REQUESTS ---
exports.getRequests = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM saas_requests ORDER BY created_at DESC');
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch requests.', 500); }
};

exports.submitRequest = async (req, res) => {
    try {
        const { clientName, email, phone, companyName, plan, contactPerson, country } = req.body;
        const [result] = await db.query(
            `INSERT INTO saas_requests (client_name, email, phone, company_name, plan, contact_person, country) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [clientName, email, phone || null, companyName || null, plan || null, contactPerson || null, country || null]
        );
        return successResponse(res, { id: result.insertId }, 'Request submitted.', 201);
    } catch (err) { return errorResponse(res, 'Failed to submit request.', 500); }
};

// POST /api/saas/requests/:id/provision
exports.provisionClient = async (req, res) => {
    try {
        const { id } = req.params;

        const [requests] = await db.query('SELECT * FROM saas_requests WHERE id = ?', [id]);
        if (requests.length === 0) return errorResponse(res, 'Request not found.', 404);

        const request = requests[0];

        // 1. Check if email is already in use
        const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [request.email]);
        if (existingUser.length > 0) {
            return errorResponse(res, 'This email is already registered or provisioned in the system.', 409);
        }

        // 2. Create company
        const [companyResult] = await db.query(
            `INSERT INTO companies (name, email, phone, location, plan, contact_person, status, source, tagline, client_type) VALUES (?, ?, ?, ?, ?, ?, 'active', 'SaaS Portal', ?, 'SaaS')`,
            [request.company_name || request.client_name, request.email, request.phone, request.country, request.plan, request.contact_person, (request.plan === 'Free' ? 'Personal' : (request.tagline || null))]
        );
        const companyId = companyResult.insertId;

        // Generate password and create user
        const password = generatePassword();
        const hashedPassword = await bcrypt.hash(password, 12);

        // Free plan clients get 'customer' role, others get 'admin' role
        const userRole = (request.plan === 'Free') ? 'customer' : 'admin';

        await db.query(
            `INSERT INTO users (company_id, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, 'active')`,
            [companyId, request.client_name, request.email, hashedPassword, userRole]
        );

        // Update request status + payment + link to company
        await db.query(`UPDATE saas_requests SET status = 'Provisioned', payment_status = 'Paid', company_id = ? WHERE id = ?`, [companyId, id]);

        // Try to send credentials email
        // Fire and forget email
        sendMail(request.email, 'Welcome to ZaneZion',
            `<h2>Your ZaneZion account is ready!</h2>
                <p>Email: <strong>${request.email}</strong></p>
                <p>Password: <strong>${password}</strong></p>
                <p>Plan: <strong>${request.plan}</strong></p>`
        ).catch(e => console.log('SaaS Welcome email failed:', e.message));

        return successResponse(res, {
            clientId: companyId,
            clientName: request.client_name,
            email: request.email,
            password,
            plan: request.plan
        }, 'Client provisioned successfully.');
    } catch (err) {
        console.error('Provision error:', err);
        return errorResponse(res, 'Provisioning failed.', 500);
    }
};

exports.updateRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;
        await db.query('UPDATE saas_requests SET status = ? WHERE id = ?', [status, req.params.id]);
        return successResponse(res, { id: req.params.id, status }, 'Request status updated.');
    } catch (err) { return errorResponse(res, 'Failed to update request.', 500); }
};

// PUT /api/saas/requests/:id — Full update of saas request fields
exports.updateRequest = async (req, res) => {
    try {
        const { client_name, email, phone, company_name, plan, contact_person, country, status, payment_status } = req.body;
        const sets = [];
        const values = [];
        if (client_name !== undefined) { sets.push('client_name = ?'); values.push(client_name); }
        if (email !== undefined) { sets.push('email = ?'); values.push(email); }
        if (phone !== undefined) { sets.push('phone = ?'); values.push(phone); }
        if (company_name !== undefined) { sets.push('company_name = ?'); values.push(company_name); }
        if (plan !== undefined) { sets.push('plan = ?'); values.push(plan); }
        if (contact_person !== undefined) { sets.push('contact_person = ?'); values.push(contact_person); }
        if (country !== undefined) { sets.push('country = ?'); values.push(country); }
        if (status !== undefined) { sets.push('status = ?'); values.push(status); }
        if (payment_status !== undefined) { sets.push('payment_status = ?'); values.push(payment_status); }
        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);
        values.push(req.params.id);
        await db.query(`UPDATE saas_requests SET ${sets.join(', ')} WHERE id = ?`, values);

        // Sync to linked company (if provisioned)
        const [reqRow] = await db.query('SELECT company_id FROM saas_requests WHERE id = ?', [req.params.id]);
        if (reqRow[0]?.company_id) {
            const compId = reqRow[0].company_id;
            const companySets = [];
            const companyVals = [];
            if (client_name !== undefined) { companySets.push('name = ?'); companyVals.push(client_name); }
            if (email !== undefined) { companySets.push('email = ?'); companyVals.push(email); }
            if (phone !== undefined) { companySets.push('phone = ?'); companyVals.push(phone); }
            if (company_name !== undefined) { companySets.push('business_name = ?'); companyVals.push(company_name); }
            if (plan !== undefined) { companySets.push('plan = ?'); companyVals.push(plan); }
            if (contact_person !== undefined) { companySets.push('contact_person = ?'); companyVals.push(contact_person); }
            if (country !== undefined) { companySets.push('location = ?'); companyVals.push(country); }
            if (companySets.length > 0) {
                companyVals.push(compId);
                await db.query(`UPDATE companies SET ${companySets.join(', ')} WHERE id = ?`, companyVals);
            }
        }

        return successResponse(res, { id: req.params.id }, 'Request updated.');
    } catch (err) { return errorResponse(res, 'Failed to update request.', 500); }
};

exports.deleteRequest = async (req, res) => {
    try {
        await db.query('DELETE FROM saas_requests WHERE id = ?', [req.params.id]);
        return successResponse(res, null, 'Request deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete request.', 500); }
};
