const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// GET /api/users/customers — returns users with role='customer' for order dropdowns
exports.getCustomers = async (req, res) => {
    try {
        // For super_admin/admin: return all customer-role users
        // company_id may be null for personal signups — include all
        const companyId = req.companyScope; // null for super_admin
        let query = `SELECT id, name, email, phone, role, status, company_id
                     FROM users WHERE role = 'customer' AND status = 'active'`;
        const params = [];

        if (companyId) {
            // Also include customers with no company (personal signups via website)
            query += ' AND (company_id = ? OR company_id IS NULL)';
            params.push(companyId);
        }
        query += ' ORDER BY name ASC';

        const [rows] = await db.query(query, params);
        return successResponse(res, rows);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch customers.', 500);
    }
};

// GET /api/users
exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req);
        // Non-superadmin: exclude only customer roles (they are managed separately)
        const excludeRoles = req.user.role !== 'super_admin' ? " AND u.role NOT IN ('customer')" : '';
        const [rows] = await db.query(
            `SELECT u.id, u.company_id, u.name, u.email, u.phone, u.role,
                    u.is_available, u.employment_status, u.status, u.joined_date,
                    u.profile_pic_url, u.birthday, u.bank_name, u.account_number,
                    u.routing_number, u.nib_number, u.vacation_balance,
                    u.passport_url, u.license_url, u.nib_doc_url, u.police_record_url,
                    u.business_license_url, c.name as company_name
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
        const body = { ...req.body };
        const { name, email, password, phone, company_id, employment_status, status } = body;

        if (!name || !email || !password) return errorResponse(res, 'Name, email, password required.', 400);

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return errorResponse(res, 'Email already exists.', 409);

        const hashedPassword = await bcrypt.hash(password, 12);
        // SuperAdmin ke liye companyScope null hota hai — default ZaneZion HQ (id=1)
        const assignedCompany = company_id || req.companyScope || 1;

        // Normalize role
        const roleMap = {
            'operations': 'operation', 'ops': 'operation',
            'field_staff': 'staff', 'field staff': 'staff',
            'staff_management': 'admin', 'client_admin': 'admin'
        };
        let normalizedRole = (body.role || 'staff').toLowerCase().trim().replace(/\s+/g, '_');
        normalizedRole = roleMap[normalizedRole] || (normalizedRole.includes('staff') ? 'staff' : normalizedRole);

        // Flatten bankingInfo → DB columns
        let bank_name = null, account_number = null, routing_number = null;
        if (body.bankingInfo && typeof body.bankingInfo === 'object') {
            bank_name      = body.bankingInfo.bank    || null;
            account_number = body.bankingInfo.account || null;
            routing_number = body.bankingInfo.routing || null;
        }

        // camelCase → snake_case
        const birthday         = body.birthday        || null;
        const nib_number       = body.nibNumber       || body.nib_number       || null;
        const vacation_balance = body.vacationBalance !== undefined ? body.vacationBalance
                               : (body.vacation_balance !== undefined ? body.vacation_balance : 0);

        const [result] = await db.query(
            `INSERT INTO users
             (name, email, password, phone, role, company_id, employment_status, status,
              birthday, bank_name, account_number, routing_number, nib_number, vacation_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, email, hashedPassword, phone || null,
                normalizedRole, assignedCompany,
                employment_status || 'Full Time', status || 'active',
                birthday, bank_name, account_number, routing_number, nib_number, vacation_balance
            ]
        );

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
        console.error('Create user failed:', err.message, err.stack);
        return errorResponse(res, `Failed to create user: ${err.message}`, 500);
    }
};

// PUT /api/users/:id
exports.update = async (req, res) => {
    try {
        const body = { ...req.body };

        // Flatten bankingInfo nested object → individual DB columns
        if (body.bankingInfo && typeof body.bankingInfo === 'object') {
            if (body.bankingInfo.bank)    body.bank_name       = body.bankingInfo.bank;
            if (body.bankingInfo.account) body.account_number  = body.bankingInfo.account;
            if (body.bankingInfo.routing) body.routing_number  = body.bankingInfo.routing;
            delete body.bankingInfo;
        }

        // Map frontend camelCase → DB snake_case
        if (body.nibNumber !== undefined)       body.nib_number      = body.nibNumber;
        if (body.vacationBalance !== undefined)  body.vacation_balance = body.vacationBalance;
        if (body.employmentStatus !== undefined) body.employment_status = body.employmentStatus;

        // Normalize role
        if (body.role) {
            const roleMap = {
                'operations': 'operation', 'ops': 'operation',
                'field_staff': 'staff', 'field staff': 'staff',
                'staff_management': 'admin', 'client_admin': 'admin'
            };
            let r = body.role.toLowerCase().trim().replace(/\s+/g, '_');
            body.role = roleMap[r] || (r.includes('staff') ? 'staff' : r);
        }

        const allowedColumns = [
            'name', 'phone', 'role', 'company_id', 'employment_status',
            'is_available', 'status', 'joined_date', 'profile_pic_url', 'password',
            'birthday', 'bank_name', 'account_number', 'routing_number',
            'nib_number', 'vacation_balance'
        ];

        const sets = [];
        const values = [];

        for (const [key, val] of Object.entries(body)) {
            if (!allowedColumns.includes(key)) continue;
            if (['id', 'created_at', 'email'].includes(key)) continue;

            if (key === 'password') {
                if (val && String(val).length >= 6) {
                    sets.push('password = ?');
                    values.push(await bcrypt.hash(val, 12));
                }
            } else {
                sets.push(`${key} = ?`);
                values.push(val === '' ? null : val);
            }
        }

        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'User updated.');
    } catch (err) {
        console.error('Update user failed:', err.message);
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

// PUT /api/users/:id/review  — Approve or reject pending staff/user within tenant
exports.review = async (req, res) => {
    try {
        const { status } = req.body; // 'active' or 'rejected'
        if (!['active', 'rejected'].includes(status)) {
            return errorResponse(res, 'Status must be "active" or "rejected".', 400);
        }
        const cs = companyScope(req);
        await db.query(
            `UPDATE users SET status = ? WHERE id = ?${cs.clause}`,
            [status, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id, status }, 'User status updated.');
    } catch (err) {
        return errorResponse(res, 'Failed to update user status.', 500);
    }
};
