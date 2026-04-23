const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { generateOTP, successResponse, errorResponse } = require('../utils/helpers');
const { sendMail } = require('../utils/mailer');
const { SYSTEM_MENUS } = require('../config/systemMenus');

// POST /api/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return errorResponse(res, 'Email and password are required.', 400);
        }

        const [users] = await db.query(
            'SELECT u.*, c.name as company_name, c.plan as company_plan, c.client_type, c.tagline FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.email = ?',
            [email]
        );

        if (users.length === 0) {
            return errorResponse(res, 'Invalid credentials.', 401);
        }

        const user = users[0];

        // Check user status
        if (user.status === 'pending') {
            return errorResponse(res, 'Account pending approval.', 403);
        }
        if (user.status === 'rejected') {
            return errorResponse(res, 'Account has been rejected.', 403);
        }
        if (user.status === 'inactive') {
            return errorResponse(res, 'Account is inactive.', 403);
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return errorResponse(res, 'Invalid credentials.', 401);
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, company_id: user.company_id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Fetch menu permissions and enrich with path/icon from system menus
        const menuMap = {};
        SYSTEM_MENUS.forEach(m => { menuMap[m.name] = m; });

        const [rawPerms] = await db.query(
            'SELECT * FROM menu_permissions WHERE role = ? AND (company_id = ? OR company_id IS NULL)',
            [user.role, user.company_id]
        );

        // Enrich DB permissions with path, icon, name so frontend sidebar can render them
        const menuPermissions = rawPerms.map(p => {
            const menu = menuMap[p.menu_name];
            return {
                ...p,
                name: p.menu_name,
                path: menu ? menu.path : null,
                icon: menu ? menu.icon : 'LayoutDashboard',
                can_view: !!p.can_view,
                can_add: !!p.can_create,
                can_edit: !!p.can_edit,
                can_delete: !!p.can_delete,
            };
        });

        // Remove password from response
        delete user.password;

        return successResponse(res, {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                company_id: user.company_id,
                company_name: user.company_name,
                plan: user.company_plan || 'Free',
                client_type: user.client_type || 'SaaS',
                is_personal: user.tagline === 'Personal' || user.company_plan === 'Free',
                phone: user.phone,
                profile_pic_url: user.profile_pic_url,
                is_available: user.is_available,
                status: user.status
            },
            menuPermissions
        }, 'Login successful');
    } catch (err) {
        console.error('Login error:', err);
        return errorResponse(res, 'Login failed.', 500);
    }
};

// POST /api/auth/register (Admin creates user)
exports.register = async (req, res) => {
    try {
        const { name, email, password, phone, role, company_id } = req.body;

        if (!name || !email || !password) {
            return errorResponse(res, 'Name, email, and password are required.', 400);
        }

        // Check if email exists
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return errorResponse(res, 'Email already registered.', 409);
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const assignedCompany = company_id || req.user?.company_id || null;

        const [result] = await db.query(
            `INSERT INTO users (name, email, password, phone, role, company_id, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
            [name, email, hashedPassword, phone || null, role || 'staff', assignedCompany]
        );

        return successResponse(res, { id: result.insertId, name, email, role: role || 'staff' }, 'User registered successfully.', 201);
    } catch (err) {
        console.error('Register error:', err);
        return errorResponse(res, 'Registration failed.', 500);
    }
};

// POST /api/auth/staff-register (Self-registration with file uploads)
exports.staffRegister = async (req, res) => {
    try {
        const { name, email, phone, password, employment_status, birthday, bank_name, account_number, routing_number, nib_number } = req.body;

        if (!name || !email || !password) {
            return errorResponse(res, 'Name, email, and password are required.', 400);
        }

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return errorResponse(res, 'Email already registered.', 409);
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // File URLs from multer
        const files = req.files || {};
        const passportUrl = files.passport ? `/uploads/${files.passport[0].filename}` : null;
        const licenseUrl = files.license ? `/uploads/${files.license[0].filename}` : null;
        const nibDocUrl = files.nib_doc ? `/uploads/${files.nib_doc[0].filename}` : null;
        const policeRecordUrl = files.police_record ? `/uploads/${files.police_record[0].filename}` : null;
        const profilePicUrl = files.profile_pic ? `/uploads/${files.profile_pic[0].filename}` : null;

        const [result] = await db.query(
            `INSERT INTO users (name, email, phone, password, role, employment_status, birthday, bank_name, account_number, routing_number, nib_number, passport_url, license_url, nib_doc_url, police_record_url, profile_pic_url, status)
             VALUES (?, ?, ?, ?, 'staff', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [name, email, phone, hashedPassword, employment_status || 'Full Time', birthday || null, bank_name || null, account_number || null, routing_number || null, nib_number || null, passportUrl, licenseUrl, nibDocUrl, policeRecordUrl, profilePicUrl]
        );

        return successResponse(res, { id: result.insertId }, 'Application submitted for review.', 201);
    } catch (err) {
        console.error('Staff register error:', err);
        return errorResponse(res, 'Registration failed.', 500);
    }
};

// PUT /api/auth/staff-review/:id
exports.staffReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'active' or 'rejected'

        const newStatus = status === 'Active' ? 'active' : status === 'Rejected' ? 'rejected' : status.toLowerCase();

        // Only allow reviewing users from same company (or super_admin)
        const companyClause = req.user.role !== 'super_admin' && req.user.company_id ? ' AND company_id = ?' : '';
        const companyParams = req.user.role !== 'super_admin' && req.user.company_id ? [req.user.company_id] : [];
        await db.query(`UPDATE users SET status = ? WHERE id = ?${companyClause}`, [newStatus, id, ...companyParams]);

        return successResponse(res, { id, status: newStatus }, 'Staff review updated.');
    } catch (err) {
        console.error('Staff review error:', err);
        return errorResponse(res, 'Review failed.', 500);
    }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return errorResponse(res, 'Email not found.', 404);
        }

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await db.query(
            'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
            [email, otp, expiresAt]
        );

        // Fire and forget email
        sendMail(email, 'ZaneZion Password Reset', `<h2>Your verification code: <strong>${otp}</strong></h2><p>This code expires in 15 minutes.</p>`)
            .catch(e => console.log('Password reset email failed:', e.message));

        return successResponse(res, { otp }, 'OTP sent to email.');
    } catch (err) {
        console.error('Forgot password error:', err);
        return errorResponse(res, 'Failed to send reset code.', 500);
    }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const [resets] = await db.query(
            'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
            [email, otp]
        );

        if (resets.length === 0) {
            return errorResponse(res, 'Invalid or expired OTP.', 400);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        await db.query('UPDATE password_resets SET used = TRUE WHERE id = ?', [resets[0].id]);

        return successResponse(res, null, 'Password reset successful.');
    } catch (err) {
        console.error('Reset password error:', err);
        return errorResponse(res, 'Password reset failed.', 500);
    }
};
