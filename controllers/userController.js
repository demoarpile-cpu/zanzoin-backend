const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// GET /api/users
exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req);
        // Non-superadmin: exclude only customer roles (they are managed separately)
        const excludeRoles = req.user.role !== 'super_admin' ? " AND u.role NOT IN ('customer')" : '';
        const [rows] = await db.query(
            `SELECT u.id, u.company_id, u.name, u.email, u.phone, u.role, u.is_available, u.employment_status, u.status, u.joined_date, u.profile_pic_url, c.name as company_name
             FROM users u LEFT JOIN companies c ON u.company_id = c.id
             WHERE 1=1 ${cf.clause}${excludeRoles} ORDER BY u.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch users.', 500);
    }
};

// GET /api/users/:id
exports.getById = async (req, res) => {
    try {
        const cs = companyScope(req, 'u');
        const [rows] = await db.query(
            `SELECT u.*, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = ?${cs.clause}`,
            [req.params.id, ...cs.params]
        );
        if (rows.length === 0) return errorResponse(res, 'User not found.', 404);
        delete rows[0].password;
        return successResponse(res, rows[0]);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch user.', 500);
    }
};

// POST /api/users
exports.create = async (req, res) => {
    try {
        const { name, email, password, phone, role, company_id, employment_status, status } = req.body;
        if (!name || !email || !password) return errorResponse(res, 'Name, email, password required.', 400);

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return errorResponse(res, 'Email already exists.', 409);

        const hashedPassword = await bcrypt.hash(password, 12);
        const assignedCompany = company_id || req.companyScope;

        // --- NORMALIZE ROLE FOR DB ENUM COMPATIBILITY ---
        // frontend "Operations" -> backend "operation"
        // frontend "Field Staff" -> backend "staff"
        const roleMap = {
            'operations': 'operation',
            'ops': 'operation',
            'field_staff': 'staff',
            'staff_management': 'admin',
            'client_admin': 'admin'
        };

        let normalizedRole = (role || 'staff').toLowerCase().trim().replace(/\s+/g, '_');
        if (roleMap[normalizedRole]) {
            normalizedRole = roleMap[normalizedRole];
        } else if (normalizedRole.includes('staff')) {
            normalizedRole = 'staff';
        }

        console.log('DEBUG: Attempting user creation', { 
            email, 
            originalRole: role, 
            normalizedRole, 
            assignedCompany 
        });

        const [result] = await db.query(
            `INSERT INTO users (name, email, password, phone, role, company_id, employment_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, phone || null, normalizedRole, assignedCompany, employment_status || 'Full Time', status || 'active']
        );
        // Notify admin about new staff
        await createNotification({
            companyId: assignedCompany,
            roleTarget: 'admin',
            type: 'alert',
            title: 'New Staff Added',
            message: `${name} joined as ${normalizedRole}`,
            link: '/dashboard/users'
        });

        return successResponse(res, { id: result.insertId, name, email, role: normalizedRole }, 'User created.', 201);
    } catch (err) {
        console.error('CRITICAL: Create user failed', { error: err.message, stack: err.stack, body: req.body });
        return errorResponse(res, `Failed to create user: ${err.message}`, 500);
    }
};

// PUT /api/users/:id
exports.update = async (req, res) => {
    try {
        const rawFields = { ...req.body };
        const sets = [];
        const values = [];

        // --- STRICT WHITELIST OF DATABASE COLUMNS ---
        const allowedColumns = [
            'name', 'phone', 'role', 'company_id', 'employment_status', 
            'is_available', 'status', 'joined_date', 'profile_pic_url', 'password'
        ];

        // --- NORMALIZE ROLE FOR DB ENUM COMPATIBILITY ---
        if (rawFields.role) {
            const roleMap = {
                'operations': 'operation',
                'ops': 'operation',
                'field_staff': 'staff',
                'staff_management': 'admin',
                'client_admin': 'admin'
            };

            let normalizedRole = rawFields.role.toLowerCase().trim().replace(/\s+/g, '_');
            if (roleMap[normalizedRole]) {
                normalizedRole = roleMap[normalizedRole];
            } else if (normalizedRole.includes('staff')) {
                normalizedRole = 'staff';
            }
            rawFields.role = normalizedRole;
        }

        for (const [key, val] of Object.entries(rawFields)) {
            if (!allowedColumns.includes(key)) continue;
            if (['id', 'created_at', 'email'].includes(key)) continue;

            if (key === 'password' && val) {
                sets.push('password = ?');
                values.push(await bcrypt.hash(val, 12));
            } else if (key !== 'password') {
                sets.push(`${key} = ?`);
                values.push(val);
            }
        }
        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);
        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'User updated.');
    } catch (err) {
        console.error('CRITICAL: Update user failed', { error: err.message, stack: err.stack, id: req.params.id });
        return errorResponse(res, `Failed to update user: ${err.message}`, 500);
    }
};

// DELETE /api/users/:id
exports.remove = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM users WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'User deleted.');
    } catch (err) {
        return errorResponse(res, 'Failed to delete user.', 500);
    }
};
