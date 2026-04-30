const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { generatePassword, successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');
const { sendMail } = require('../utils/mailer');

// GET /api/customers (aliased as /api/clients)
exports.getAll = async (req, res) => {
    try {
        const role = req.user.role;

        // Super Admin → sees companies, filtered by client_type if provided
        if (role === 'super_admin') {
            const clientType = req.query.client_type;
            
            // Special handling for Personal clients stored as SaaS + tagline metadata
            let query = `SELECT c.*,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) as total_users,
                    (SELECT COUNT(*) FROM customers cu WHERE cu.company_id = c.id) as total_customers,
                    (SELECT COUNT(*) FROM orders o WHERE o.company_id = c.id) as total_orders
                 FROM companies c
                 WHERE c.id != 1`;
            const queryParams = [];

            if (clientType === 'Business') {
                // Business tab: signed up via website as business account
                query += ` AND (c.client_type = 'Business' OR c.tenant_type = 'business')`;
            } else if (clientType === 'SaaS') {
                // SaaS tab: SaaS type, not business, not personal
                query += ` AND c.client_type = 'SaaS' AND (c.tenant_type = 'saas' OR c.tenant_type IS NULL) AND (c.tagline != 'Personal' OR c.tagline IS NULL)`;
            } else if (clientType === 'Personal') {
                query += ` AND (c.tagline = 'Personal' OR c.client_type = 'Personal' OR c.plan = 'Free')`;
            } else if (clientType) {
                query += ` AND c.client_type = ?`;
                queryParams.push(clientType);
            }

            query += ` ORDER BY c.created_at DESC`;
            const [rows] = await db.query(query, queryParams);
            return successResponse(res, rows);
        }

        // Admin/Staff → sees only their company's customers
        const companyId = req.user.company_id;
        if (!companyId) return successResponse(res, []);

        const [rows] = await db.query(
            `SELECT * FROM customers WHERE company_id = ? ORDER BY created_at DESC`,
            [companyId]
        );
        return successResponse(res, rows);
    } catch (err) {
        console.error('Get customers error:', err);
        return errorResponse(res, 'Failed to fetch customers.', 500);
    }
};

// GET /api/customers/:id
exports.getById = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        const table = isSuperAdmin ? 'companies' : 'customers';
        const cs = companyScope(req);
        
        const queryParams = isSuperAdmin ? [req.params.id] : [req.params.id, ...cs.params];
        const [rows] = await db.query(`SELECT * FROM ${table} WHERE id = ?${isSuperAdmin ? '' : cs.clause}`, queryParams);
        if (rows.length === 0) return errorResponse(res, 'Client not found.', 404);
        return successResponse(res, rows[0]);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch record.', 500);
    }
};

// POST /api/customers
exports.create = async (req, res) => {
    try {
        const { name, email, phone, contact, address, client_type, password,
                billing_cycle, payment_method, contact_person, business_name,
                logo_url, source, status, plan, location } = req.body;

        const role = req.user.role;

        // --- EMAIL UNIQUENESS CHECK ---
        if (email) {
            const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
            if (existingUser.length > 0) {
                return errorResponse(res, 'This email is already registered in the system.', 400);
            }
            
            // Also check companies/customers just in case (for records without users)
            const [existingCompany] = await db.query('SELECT id FROM companies WHERE email = ?', [email]);
            const [existingCust] = await db.query('SELECT id FROM customers WHERE email = ?', [email]);
            if (existingCompany.length > 0 || existingCust.length > 0) {
                return errorResponse(res, 'This email is already associated with an existing client/customer record.', 400);
            }
        }
        if (role === 'super_admin') {
            // Create company
            const [companyResult] = await db.query(
                `INSERT INTO companies (name, email, phone, location, plan, billing_cycle, payment_method, contact_person, client_type, logo_url, tagline, source, created_by, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [business_name || name, email || null, phone || null, address || location || null, plan || 'Essentials',
                 billing_cycle || 'Monthly', payment_method || null, contact_person || contact || null,
                 (client_type === 'Personal' || plan === 'Free' ? 'SaaS' : (client_type || 'SaaS')),
                 logo_url || null,
                 (client_type === 'Personal' || plan === 'Free' ? 'Personal' : (req.body.tagline || null)),
                 source || 'Admin Dashboard', req.user.id, status || 'active']
            );
            const newCompanyId = companyResult.insertId;

            // Create client user for this company if email provided
            let credentials = null;
            if (email) {
                const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
                if (existingUser.length === 0) {
                    const userPassword = password || generatePassword();
                    const hashedPassword = await bcrypt.hash(userPassword, 12);
                    
                    // Normalize client_type for DB ENUM if needed
                    const normalizedClientType = client_type === 'Personal' ? 'Individual' : (client_type || 'SaaS');

                    // Personal/Free clients get 'customer' role, SaaS clients get 'admin' role
                    const userRole = (client_type === 'Personal' || plan === 'Free') ? 'customer' : 'admin';

                    await db.query(
                        `INSERT INTO users (company_id, name, email, password, phone, role, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
                        [newCompanyId, name, email, hashedPassword, phone || null, userRole]
                    );

                    // Fire and forget email - don't await to prevent API hanging
                    sendMail(email, 'Welcome to ZaneZion',
                        `<h2>Your ZaneZion ${userRole === 'customer' ? 'Personal' : 'Institutional'} account is ready!</h2>
                         <p>Email: <strong>${email}</strong></p>
                         <p>Password: <strong>${userPassword}</strong></p>
                         <p>Type: <strong>${normalizedClientType}</strong></p>`
                    ).catch(e => console.log('Welcome email failed:', e.message));

                    credentials = { email, password: userPassword, message: `Login credentials generated and sent to ${email}` };
                }
            }

            const responseData = { id: newCompanyId, name: business_name || name };
            if (credentials) responseData.credentials = credentials;

            // Notify super_admin about new client
            await createNotification({
                roleTarget: 'super_admin',
                type: 'alert',
                title: 'New Client Registered',
                message: `${business_name || name} has been added as a ${client_type || 'SaaS'} client`,
                link: '/dashboard/clients'
            });

            return successResponse(res, responseData, 'Client company created.', 201);
        }

        // ─── ADMIN/STAFF: creates a customer under their company ───
        const companyId = req.user.company_id;
        if (!companyId) return errorResponse(res, 'No company associated.', 400);

        // Create customer record
        const [result] = await db.query(
            `INSERT INTO customers (company_id, name, email, phone, contact, address, client_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, email || null, phone || null, contact || contact_person || null, address || location || null, (client_type === 'Personal' ? 'Direct' : (client_type || 'Direct')), status || 'active']
        );

        // Create login user for customer if email provided
        let credentials = null;
        if (email) {
            const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);

            if (existingUser.length === 0) {
                const userPassword = password || generatePassword();
                const hashedPassword = await bcrypt.hash(userPassword, 12);

                await db.query(
                    `INSERT INTO users (company_id, name, email, password, phone, role, status) VALUES (?, ?, ?, ?, ?, 'customer', 'active')`,
                    [companyId, name, email, hashedPassword, phone || null]
                );

                // Fire and forget email
                sendMail(email, 'Your Account Credentials', 
                    `<h2>Your ZaneZion customer account is ready!</h2>
                     <p>Email: <strong>${email}</strong></p>
                     <p>Password: <strong>${userPassword}</strong></p>`
                ).catch(e => console.log('Customer email failed:', e.message));

                credentials = { email, password: userPassword, message: `Login credentials generated and sent to ${email}` };
            }
        }

        const responseData = { id: result.insertId, name };
        if (credentials) responseData.credentials = credentials;

        return successResponse(res, responseData, 'Customer created.', 201);
    } catch (err) {
        console.error('Create customer error:', err);
        return errorResponse(res, `Failed to create customer: ${err.message}`, 500);
    }
};

// PUT /api/customers/:id
exports.update = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        const table = isSuperAdmin ? 'companies' : 'customers';

        const rawFields = { ...req.body };
        
        // --- MAP CLIENT TYPE FOR DB COMPATIBILITY ---
        if (rawFields.client_type === 'Personal') {
            if (isSuperAdmin) {
                rawFields.client_type = 'SaaS';
                rawFields.tagline = 'Personal';
            } else {
                rawFields.client_type = 'Direct';
            }
        }

        // --- STRICT WHITELIST PER TABLE (companies & customers have different columns) ---
        const allowedColumns = isSuperAdmin
            ? ['name', 'email', 'phone', 'location', 'plan', 'billing_cycle',
               'payment_method', 'contact_person', 'client_type', 'logo_url',
               'tagline', 'source', 'status', 'address', 'contact', 'business_name']
            : ['name', 'email', 'phone', 'contact', 'address', 'client_type', 'status'];

        const sets = [];
        const values = [];
        for (const [key, val] of Object.entries(rawFields)) {
            // Ignore ID/Internal fields and ONLY allow whitelisted columns from the official schema
            if (['id', 'created_at', 'company_id', 'password', 'credentials'].includes(key)) continue;
            if (!allowedColumns.includes(key)) continue;

            sets.push(`${key} = ?`);
            values.push(val);
        }
        if (sets.length === 0) return errorResponse(res, 'No modifyable fields provided.', 400);
        const cs = companyScope(req);
        values.push(req.params.id);
        if (!isSuperAdmin) values.push(...cs.params);
        
        await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?${isSuperAdmin ? '' : cs.clause}`, values);

        // If status changed to active and this customer has no user account yet, create one
        if (rawFields.status && rawFields.status.toLowerCase() === 'active') {
            const [customer] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
            if (customer.length > 0 && customer[0].email) {
                const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [customer[0].email]);
                if (existingUser.length === 0) {
                    const userPassword = generatePassword();
                    const hashedPassword = await bcrypt.hash(userPassword, 12);
                    await db.query(
                        `INSERT INTO users (company_id, name, email, password, role, status) VALUES (?, ?, ?, ?, 'customer', 'active')`,
                        [isSuperAdmin ? customer[0].id : customer[0].company_id, customer[0].name, customer[0].email, hashedPassword]
                    );
                    return successResponse(res, {
                        id: req.params.id,
                        credentials: { email: customer[0].email, password: userPassword, message: `Credentials generated for ${customer[0].name}` }
                    }, 'Client activated with login credentials.');
                }
            }
        }

        // Sync back to saas_requests if linked (saas_requests may not have company_id — skip safely)
        if (isSuperAdmin) {
            try {
                const [linkedReq] = await db.query(
                    'SELECT id FROM saas_requests WHERE email = ? LIMIT 1',
                    [rawFields.email || '']
                );
                if (linkedReq.length > 0) {
                    const syncSets = [];
                    const syncVals = [];
                    if (rawFields.name)           { syncSets.push('client_name = ?');    syncVals.push(rawFields.name); }
                    if (rawFields.phone)          { syncSets.push('phone = ?');           syncVals.push(rawFields.phone); }
                    if (rawFields.plan)           { syncSets.push('plan = ?');            syncVals.push(rawFields.plan); }
                    if (rawFields.contact_person) { syncSets.push('contact_person = ?'); syncVals.push(rawFields.contact_person); }
                    if (syncSets.length > 0) {
                        syncVals.push(linkedReq[0].id);
                        await db.query(`UPDATE saas_requests SET ${syncSets.join(', ')} WHERE id = ?`, syncVals);
                    }
                }
            } catch (syncErr) {
                console.log('saas_requests sync skipped:', syncErr.message);
            }
        }

        return successResponse(res, { id: req.params.id }, 'Client record updated.');
    } catch (err) {
        console.error('Update error detail:', err);
        return errorResponse(res, `Failed to update record: ${err.message}`, 500);
    }
};

// DELETE /api/customers/:id
exports.remove = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        const table = isSuperAdmin ? 'companies' : 'customers';
        const cs = companyScope(req);

        // Fetch record to get email for user deletion
        const query = `SELECT email FROM ${table} WHERE id = ?${isSuperAdmin ? '' : cs.clause}`;
        const queryParams = isSuperAdmin ? [req.params.id] : [req.params.id, ...cs.params];
        const [records] = await db.query(query, queryParams);
        
        if (records.length === 0) return errorResponse(res, 'Client record not found.', 404);
        
        const email = records[0].email;
        if (email) {
            // Delete associated users (Admin/Client for companies, Customer for customers)
            await db.query('DELETE FROM users WHERE email = ? AND role IN ("customer","admin")', [email]);
        }
        
        // Delete the actual record
        await db.query(`DELETE FROM ${table} WHERE id = ?${isSuperAdmin ? '' : cs.clause}`, queryParams);
        
        return successResponse(res, null, 'Client record deleted successfully.');
    } catch (err) {
        console.error('Delete error:', err);
        return errorResponse(res, 'Failed to delete record.', 500);
    }
};
