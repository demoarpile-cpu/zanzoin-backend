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
            `SELECT u.*, c.name as company_name, c.plan as company_plan,
                    c.client_type, c.tagline, c.tenant_type, c.status as company_status
             FROM users u
             LEFT JOIN companies c ON u.company_id = c.id
             WHERE u.email = ?`,
            [email]
        );

        if (users.length === 0) {
            return errorResponse(res, 'Invalid credentials.', 401);
        }

        const user = users[0];

        // Check user status (and auto-sync when company already approved)
        // Some approval flows activate company/request but leave user.status as pending.
        // In that case, auto-promote user to active so approved SaaS/business accounts can log in.
        if (user.status === 'pending') {
            const companyApproved = String(user.company_status || '').toLowerCase() === 'active';
            if (companyApproved && user.company_id) {
                await db.query('UPDATE users SET status = ? WHERE id = ?', ['active', user.id]);
                user.status = 'active';
            } else {
                return errorResponse(res, 'Account pending approval.', 403);
            }
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

        let [rawPerms] = await db.query(
            'SELECT * FROM menu_permissions WHERE role = ? AND (company_id = ? OR company_id IS NULL)',
            [user.role, user.company_id]
        );

        // Field staff: effective rights = this user's staff row ∩ same company's admin row (per menu).
        // Admin ne jo module allow nahi kiya, staff ko wo kabhi open nahi hoga.
        if (String(user.role || '').toLowerCase() === 'staff' && user.company_id) {
            const [adminPerms] = await db.query(
                'SELECT menu_name, can_view, can_create, can_edit, can_delete FROM menu_permissions WHERE role = ? AND company_id = ?',
                ['admin', user.company_id]
            );
            if (adminPerms.length > 0) {
                const adminByMenu = new Map(adminPerms.map((r) => [r.menu_name, r]));
                rawPerms = rawPerms.map((p) => {
                    const a = adminByMenu.get(p.menu_name);
                    if (!a) {
                        return { ...p, can_view: 0, can_create: 0, can_edit: 0, can_delete: 0 };
                    }
                    return {
                        ...p,
                        can_view: p.can_view && a.can_view ? 1 : 0,
                        can_create: p.can_create && a.can_create ? 1 : 0,
                        can_edit: p.can_edit && a.can_edit ? 1 : 0,
                        can_delete: p.can_delete && a.can_delete ? 1 : 0,
                    };
                });
            }
        }

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
                // Tenant info
                tenant_id: user.company_id,
                tenant_type: user.tenant_type || 'zanezion',
                plan: user.company_plan || 'Free',
                client_type: user.client_type || 'SaaS',
                is_personal: user.tagline === 'Personal' || user.company_plan === 'Free',
                phone: user.phone,
                profile_pic_url: user.profile_pic_url,
                is_available: user.is_available,
                status: user.status,
                // Profile fields
                birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
                bank_name: user.bank_name || null,
                account_number: user.account_number || null,
                routing_number: user.routing_number || null,
                nib_number: user.nib_number || null,
                vacation_balance: user.vacation_balance ?? 0,
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

// POST /api/auth/signup  — Public self-registration (Personal / Business / SaaS)
exports.publicSignup = async (req, res) => {
    try {
        const { name, email, password, phone, accountType, companyName } = req.body;

        if (!name || !email || !password) {
            return errorResponse(res, 'Name, email, and password are required.', 400);
        }
        if (!['personal', 'business', 'saas'].includes(accountType)) {
            return errorResponse(res, 'Invalid account type.', 400);
        }

        const cleanEmail = email.toLowerCase().trim();

        // Check duplicate email
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (existing.length > 0) {
            return errorResponse(res, 'Email already registered.', 409);
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // ── PERSONAL ACCOUNT ─────────────────────────────────────────────────
        // No company, instant activation, role = customer
        if (accountType === 'personal') {
            const [result] = await db.query(
                `INSERT INTO users (name, email, password, phone, role, status)
                 VALUES (?, ?, ?, ?, 'customer', 'active')`,
                [name.trim(), cleanEmail, hashedPassword, phone || null]
            );
            return successResponse(res, {
                id: result.insertId, name, email: cleanEmail,
                role: 'customer', status: 'active'
            }, 'Personal account created. You can log in now.', 201);
        }

        // ── BUSINESS ACCOUNT ──────────────────────────────────────────────────
        // Creates a new tenant (company) with type=Business
        // User gets role = 'client', status = pending until super_admin approves
        if (accountType === 'business') {
            const businessLicenseUrl = req.file ? `/uploads/${req.file.filename}` : null;

            const [companyResult] = await db.query(
                `INSERT INTO companies (name, email, phone, client_type, tenant_type, status, source)
                 VALUES (?, ?, ?, 'Business', 'business', 'pending', 'self_signup')`,
                [companyName || name, cleanEmail, phone || null]
            );
            const companyId = companyResult.insertId;

            const [userResult] = await db.query(
                `INSERT INTO users (name, email, password, phone, role, company_id, business_license_url, status)
                 VALUES (?, ?, ?, ?, 'client', ?, ?, 'pending')`,
                [name.trim(), cleanEmail, hashedPassword, phone || null, companyId, businessLicenseUrl]
            );

            try {
                const { createNotification } = require('./notificationController');
                await createNotification({
                    roleTarget: 'super_admin',
                    type: 'signup',
                    title: 'New Business Account Pending',
                    message: `${name} (${companyName || name}) applied for a Business account. License review required.`,
                    link: '/dashboard/clients'
                });
            } catch (e) { /* non-critical */ }

            return successResponse(res, {
                id: userResult.insertId, name, email: cleanEmail,
                role: 'client', status: 'pending', companyId
            }, 'Business account submitted for review. You will be notified upon approval.', 201);
        }

        // ── SAAS ACCOUNT ──────────────────────────────────────────────────────
        // Creates a new isolated TENANT (company) with type=SaaS
        // User becomes the TENANT ADMIN (role = 'admin') of that tenant
        // They can then add their own staff (operations, logistics, etc.)
        if (accountType === 'saas') {
            const [companyResult] = await db.query(
                `INSERT INTO companies (name, email, phone, client_type, tenant_type, status, source, saas_fee_paid)
                 VALUES (?, ?, ?, 'SaaS', 'saas', 'pending', 'self_signup', FALSE)`,
                [companyName || name, cleanEmail, phone || null]
            );
            const companyId = companyResult.insertId;

            // SaaS user = Tenant Admin of their own company
            const [userResult] = await db.query(
                `INSERT INTO users (name, email, password, phone, role, company_id, status)
                 VALUES (?, ?, ?, ?, 'admin', ?, 'pending')`,
                [name.trim(), cleanEmail, hashedPassword, phone || null, companyId]
            );

            try {
                const { createNotification } = require('./notificationController');
                await createNotification({
                    roleTarget: 'super_admin',
                    type: 'signup',
                    title: 'New SaaS Tenant Pending',
                    message: `${name} signed up for SaaS membership. Payment & review required.`,
                    link: '/dashboard/saas-clients'
                });
            } catch (e) { /* non-critical */ }

            return successResponse(res, {
                id: userResult.insertId, name, email: cleanEmail,
                role: 'admin', status: 'pending', companyId,
                tenantId: companyId
            }, 'SaaS account submitted for review. You will be notified upon approval.', 201);
        }

    } catch (err) {
        console.error('Public signup error:', err);
        return errorResponse(res, 'Signup failed. Please try again.', 500);
    }
};

// PUT /api/auth/profile  — Authenticated profile update
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email, phone, password, birthday, bankName, accountNumber, routingNumber, nibNumber } = req.body;

        // Build dynamic update query
        const sets = [];
        const values = [];

        if (name)          { sets.push('name = ?');            values.push(name.trim()); }
        if (email)         { sets.push('email = ?');           values.push(email.toLowerCase().trim()); }
        if (phone !== undefined) { sets.push('phone = ?');     values.push(phone || null); }
        if (birthday)      { sets.push('birthday = ?');        values.push(birthday); }
        if (bankName !== undefined)      { sets.push('bank_name = ?');       values.push(bankName || null); }
        if (accountNumber !== undefined) { sets.push('account_number = ?');  values.push(accountNumber || null); }
        if (routingNumber !== undefined) { sets.push('routing_number = ?');  values.push(routingNumber || null); }
        if (nibNumber !== undefined)     { sets.push('nib_number = ?');      values.push(nibNumber || null); }

        if (password && password.trim().length >= 8) {
            const hashed = await bcrypt.hash(password, 12);
            sets.push('password = ?');
            values.push(hashed);
        }

        if (sets.length === 0) {
            return errorResponse(res, 'No fields to update.', 400);
        }

        values.push(userId);
        await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);

        // Return updated user data
        const [rows] = await db.query(
            'SELECT id, name, email, phone, role, company_id, birthday, bank_name, account_number, routing_number, nib_number, vacation_balance, profile_pic_url FROM users WHERE id = ?',
            [userId]
        );
        const updated = rows[0];

        return successResponse(res, {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            birthday: updated.birthday ? updated.birthday.toISOString().split('T')[0] : null,
            bank_name: updated.bank_name,
            account_number: updated.account_number,
            routing_number: updated.routing_number,
            nib_number: updated.nib_number,
            vacation_balance: updated.vacation_balance ?? 0,
        }, 'Profile updated successfully.');

    } catch (err) {
        console.error('Update profile error:', err);
        return errorResponse(res, 'Profile update failed.', 500);
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
