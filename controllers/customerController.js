const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { generatePassword, successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');
const { sendMail } = require('../utils/mailer');

function isSuperAdminRole(user) {
    if (!user) return false;
    const r = String(user.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    // ONLY true super_admin gets company-creation privileges
    return r === 'super_admin' || r === 'superadmin';
}

function isPlatformAdminRole(user) {
    if (!user) return false;
    const r = String(user.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    // Both super_admin and HQ admin (admin with no tenant binding) are platform admins
    const isSA = r === 'super_admin' || r === 'superadmin';
    const companyId = user.company_id ?? user.companyId;
    const isHQAdmin = r === 'admin' && (companyId == 1 || !companyId || companyId === '0' || companyId === 0);
    return isSA || isHQAdmin;
}

async function getAllowedUserRoles() {
    const [rows] = await db.query(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'role'
         LIMIT 1`
    );
    const colType = String(rows?.[0]?.COLUMN_TYPE || '');
    const matches = [...colType.matchAll(/'([^']+)'/g)];
    return new Set(matches.map((m) => String(m[1] || '').toLowerCase()));
}

function resolveRoleForStorage(logicalRole, allowedRoles) {
    const role = String(logicalRole || '').toLowerCase();
    const aliases = {
        business_client: ['business_client', 'business client', 'client'],
        saas_client: ['saas_client', 'saas client', 'admin'],
        super_admin: ['super_admin', 'superadmin', 'super admin'],
        customer: ['customer', 'client']
    };
    const candidates = aliases[role] || [role];
    const match = candidates.find((c) => allowedRoles.has(c));
    return match || logicalRole;
}

function normalizeClientType(val) {
    const r = String(val || '').trim().toLowerCase();
    if (!r) return 'SaaS';
    if (r === 'personal' || r === 'customer' || r === 'individual' || r === 'direct') return 'Personal';
    if (r === 'business' || r === 'client' || r === 'business_client' || r === 'business client') return 'Business';
    if (r === 'saas' || r === 'saas_client' || r === 'saas client') return 'SaaS';
    return val; // Keep original if no match, but usually we map
}

// GET /api/customers (aliased as /api/clients)
exports.getAll = async (req, res) => {
    try {
        const clientType = req.query.client_type;
        const search = req.query.search;

        const isTrueSuperAdmin = isSuperAdminRole(req.user); // only role=super_admin
        const isPlatformAdmin = isPlatformAdminRole(req.user); // super_admin OR HQ admin (null company_id)

        // ─── TRUE SUPER ADMIN: sees Companies (SaaS/Business tenants) ───
        if (isTrueSuperAdmin && (clientType === 'SaaS' || clientType === 'Business' || !clientType)) {
            let query = `SELECT c.*,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) as total_users,
                    (SELECT COUNT(*) FROM customers cu WHERE cu.company_id = c.id) as total_customers,
                    (SELECT COUNT(*) FROM orders o WHERE o.company_id = c.id) as total_orders
                 FROM companies c
                 WHERE c.id != 1`;
            const queryParams = [];

            if (clientType === 'Business') {
                query += ` AND (c.client_type = 'Business' OR c.tenant_type = 'business')`;
            } else if (clientType === 'SaaS') {
                query += ` AND c.client_type = 'SaaS' AND (c.tenant_type = 'saas' OR c.tenant_type IS NULL) AND (c.tagline != 'Personal' OR c.tagline IS NULL)`;
            }

            if (search) {
                query += ` AND (c.name LIKE ? OR c.email LIKE ?)`;
                queryParams.push(`%${search}%`, `%${search}%`);
            }

            query += ` ORDER BY c.created_at DESC`;
            const [rows] = await db.query(query, queryParams);
            return successResponse(res, rows);
        }

        // ─── PLATFORM ADMIN (super_admin OR HQ admin): sees Customers table ───
        if (isPlatformAdmin) {
            let query = `SELECT * FROM customers WHERE 1=1`;
            const params = [];

            // Filter by client_type if requested
            if (clientType === 'Personal' || clientType === 'Direct' || !clientType) {
                // No extra filter — show all personal customers
            }

            if (search) {
                query += ` AND (name LIKE ? OR email LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ` ORDER BY created_at DESC`;
            const [rows] = await db.query(query, params);
            return successResponse(res, rows);
        }

        // ─── TENANT ADMIN / STAFF: sees only their company's customers ───
        const normalizePositiveInt = (val) => {
            if (val == null || val === '') return null;
            const n = Number(val);
            if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
            return Math.trunc(n);
        };

        let companyId =
            normalizePositiveInt(req.companyScope) ||
            normalizePositiveInt(req.user.company_id);

        if (!companyId) return successResponse(res, []);

        let query = `SELECT * FROM customers WHERE company_id = ?`;
        const params = [companyId];

        if (search) {
            query += ` AND (name LIKE ? OR email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY created_at DESC`;
        const [rows] = await db.query(query, params);
        return successResponse(res, rows);
    } catch (err) {
        console.error('Get customers error:', err);
        return errorResponse(res, 'Failed to fetch customers.', 500);
    }
};

// GET /api/customers/:id
exports.getById = async (req, res) => {
    try {
        const isSuperAdmin = isSuperAdminRole(req.user);
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
        const { name, email, phone, contact, address, password,
            billing_cycle, payment_method, contact_person, business_name,
            logo_url, source, status, plan, location } = req.body;
        
        // Handle both snake_case and camelCase from frontend
        const rawType = req.body.client_type || req.body.clientType || 'SaaS';
        const client_type = normalizeClientType(rawType);

        const role = req.user.role;


        // --- EMAIL UNIQUENESS CHECK ---
        if (email) {
            const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
            if (existingUser.length > 0) {
                return errorResponse(res, 'This email is already registered in the system.', 400);
            }

            // Recovery path: if prior create failed midway (company created but user insert failed),
            // reuse that company instead of hard-failing on duplicate email in companies table.
            if (isSuperAdminRole(req.user) && client_type !== 'Personal') {
                const [existingCompany] = await db.query(
                    'SELECT id, name FROM companies WHERE email = ? ORDER BY id DESC LIMIT 1',
                    [email]
                );
                if (existingCompany.length > 0) {
                    const companyId = existingCompany[0].id;
                    const allowedRoles = await getAllowedUserRoles();
                    const userPassword = password || generatePassword();
                    const hashedPassword = await bcrypt.hash(userPassword, 12);
                    const typeNorm = String(client_type || '').toLowerCase();
                    let userRole = 'saas_client';
                    if (client_type === 'Personal' || plan === 'Free') userRole = 'customer';
                    else if (typeNorm === 'business') userRole = 'business_client';
                    else if (typeNorm === 'saas') userRole = 'saas_client';
                    const storedRole = resolveRoleForStorage(userRole, allowedRoles);

                    await db.query(
                        `INSERT INTO users (company_id, name, email, password, phone, role, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
                        [companyId, name, email, hashedPassword, phone || null, storedRole, req.user.id]
                    );

                    sendMail(email, 'Welcome to ZaneZion',
                        `<h2>Your ZaneZion ${storedRole === 'customer' ? 'Personal' : 'Institutional'} account is ready!</h2>
                         <p>Email: <strong>${email}</strong></p>
                         <p>Password: <strong>${userPassword}</strong></p>`
                    ).catch(e => console.log('Recovery welcome email failed:', e.message));

                    return successResponse(res, {
                        id: companyId,
                        name: existingCompany[0].name || business_name || name,
                        credentials: { email, password: userPassword, message: `Existing client recovered and login credentials sent to ${email}` }
                    }, 'Existing client record recovered and login created.', 201);
                }
            }

            const [existingCust] = await db.query('SELECT id FROM customers WHERE email = ?', [email]);
            if (existingCust.length > 0) {
                return errorResponse(res, 'This email is already associated with an existing client/customer record.', 400);
            }
        }
        // --- PLATFORM ONBOARDING (Super Admin / HQ Admin) ---
        // SaaS and Business signups create a new Tenant (Company record)
        if (isSuperAdminRole(req.user) && client_type !== 'Personal' && client_type !== 'Direct') {
            const allowedRoles = await getAllowedUserRoles();
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

                    // Role mapping for super-admin manual client creation:
                    // Personal -> customer, SaaS -> saas_client, Business -> business_client
                    const typeNorm = String(client_type || '').toLowerCase();
                    let userRole = 'saas_client';
                    if (client_type === 'Personal' || plan === 'Free') userRole = 'customer';
                    else if (typeNorm === 'business') userRole = 'business_client';
                    else if (typeNorm === 'saas') userRole = 'saas_client';
                    const storedRole = resolveRoleForStorage(userRole, allowedRoles);

                    await db.query(
                        `INSERT INTO users (company_id, name, email, password, phone, role, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
                        [newCompanyId, name, email, hashedPassword, phone || null, storedRole, req.user.id]
                    );

                    // Fire and forget email - don't await to prevent API hanging
                    sendMail(email, 'Welcome to ZaneZion',
                        `<h2>Your ZaneZion ${storedRole === 'customer' ? 'Personal' : 'Institutional'} account is ready!</h2>
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
        // Prefer scoped company from middleware; fallback to JWT user company.
        // For platform admin accounts without tenant binding, allow DEFAULT_COMPANY_ID.
        const normalizePositiveInt = (val) => {
            if (val == null || val === '') return null;
            const n = Number(val);
            if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
            return Math.trunc(n);
        };
        const fallbackCompanyId = normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);
        const roleNorm = String(role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isPlatformAdmin = isPlatformAdminRole(req.user);
        let companyId =
            normalizePositiveInt(req.companyScope) ||
            normalizePositiveInt(req.user.company_id) ||
            (isPlatformAdmin ? fallbackCompanyId : null);
        if (!companyId) return errorResponse(res, 'No company associated.', 400);

        let [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);
        
        // --- EMERGENCY HEALING: If no companies exist and user is platform admin, create HQ company ---
        if (!companyRows.length && isPlatformAdmin) {
            const [allCompanies] = await db.query('SELECT id FROM companies LIMIT 1');
            if (allCompanies.length === 0) {
                console.log("Emergency: No companies found. Creating HQ Company for Platform Admin.");
                const [hqResult] = await db.query(
                    `INSERT INTO companies (id, name, email, plan, status) VALUES (1, 'ZaneZion HQ', 'hq@zanezion.com', 'Enterprise', 'active')`
                );
                companyId = hqResult.insertId || 1;
                companyRows = [{ id: companyId }];
            } else {
                // Fallback for misconfigured DEFAULT_COMPANY_ID: use first available company.
                const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
                if (anyCompany.length) {
                    companyId = anyCompany[0].id;
                    companyRows = anyCompany;
                }
            }
        }

        if (!companyRows.length) {
            return errorResponse(res, 'Invalid company mapping. Please create a company first in Clients menu or ensure at least one company exists.', 400);
        }

        // Create customer record
        const [result] = await db.query(
            `INSERT INTO customers (company_id, name, email, phone, contact, address, client_type, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, email || null, phone || null, contact || contact_person || null, address || location || null, (client_type === 'Personal' ? 'Direct' : (client_type || 'Direct')), status || 'active', req.user.id]
        );

        // Create login user for customer if email provided
        let credentials = null;
        if (email) {
            const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);

            if (existingUser.length === 0) {
                const userPassword = password || generatePassword();
                const hashedPassword = await bcrypt.hash(userPassword, 12);

                await db.query(
                    `INSERT INTO users (company_id, name, email, password, phone, role, status, created_by) VALUES (?, ?, ?, ?, ?, 'customer', 'active', ?)`,
                    [companyId, name, email, hashedPassword, phone || null, req.user.id]
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
        const isSuperAdmin = isSuperAdminRole(req.user);
        const isPlatformAdmin = isPlatformAdminRole(req.user);
        // By default platform admins update 'customers'; true super_admin may update 'companies' too
        let table = 'customers';

        // --- SMART TABLE SELECTION FOR TRUE SUPER ADMIN ONLY ---
        if (isSuperAdmin) {
            const [compExists] = await db.query('SELECT id FROM companies WHERE id = ?', [req.params.id]);
            if (compExists.length > 0) {
                // It's a company record - update companies unless it's Personal type
                if (req.body.client_type === 'Personal' || req.body.client_type === 'Direct') {
                    const [custExists] = await db.query('SELECT id FROM customers WHERE id = ?', [req.params.id]);
                    if (custExists.length > 0) table = 'customers';
                    else table = 'companies';
                } else {
                    table = 'companies';
                }
            }
        }

        const rawFields = { ...req.body };

        // --- MAP CLIENT TYPE FOR DB COMPATIBILITY ---
        if (rawFields.client_type === 'Personal' || rawFields.client_type === 'Direct') {
            if (table === 'companies') {
                rawFields.client_type = 'SaaS';
                rawFields.tagline = 'Personal';
            } else {
                rawFields.client_type = 'Direct';
            }
        }

        // --- UNIVERSAL CONTACT & NAME SYNC ---
        if (rawFields.contact_person && !rawFields.contact) rawFields.contact = rawFields.contact_person;
        if (rawFields.contact && !rawFields.contact_person) rawFields.contact_person = rawFields.contact;
        if (rawFields.business_name) rawFields.name = rawFields.business_name;
        else if (rawFields.name) rawFields.business_name = rawFields.name;

        // --- STRICT WHITELIST PER TABLE ---
        const allowedColumns = (table === 'companies')
            ? ['name', 'email', 'phone', 'location', 'plan', 'billing_cycle',
                'payment_method', 'contact_person', 'client_type', 'logo_url',
                'tagline', 'source', 'status', 'address', 'contact', 'business_name']
            : ['name', 'email', 'phone', 'contact', 'address', 'client_type', 'status', 'company_id'];

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
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        const cs = companyScope(req);
        
        let scopingClause = '';
        if (!isSuperAdmin) {
            if (isHQ && table === 'customers') {
                scopingClause = ' AND created_by = ?';
                values.push(req.user.id);
            } else {
                scopingClause = cs.clause;
                values.push(...cs.params);
            }
        }
        values.push(req.params.id); // Re-ordering for the query below

        // Need to swap order of values because query has id = ? THEN scopingClause
        // WAIT: query is UPDATE ... WHERE id = ?${scopingClause}
        // So values should be [val1, val2, ..., id, ...scopingParams]
        
        // Let's re-align the logic
        const updateValues = [...values.slice(0, sets.length)]; // the field values
        updateValues.push(req.params.id);
        if (!isSuperAdmin) {
            if (isHQ && table === 'customers') {
                updateValues.push(req.user.id);
            } else {
                updateValues.push(...cs.params);
            }
        }

        await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?${isSuperAdmin ? '' : scopingClause}`, updateValues);

        // If status changed to active and this customer has no user account yet, create one
        if (rawFields.status && rawFields.status.toLowerCase() === 'active') {
            const [customer] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
            if (customer.length > 0 && customer[0].email) {
                const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [customer[0].email]);
                if (existingUser.length === 0) {
                    const userPassword = generatePassword();
                    const hashedPassword = await bcrypt.hash(userPassword, 12);
                    await db.query(
                        `INSERT INTO users (company_id, name, email, password, role, status, created_by) VALUES (?, ?, ?, ?, 'customer', 'active', ?)`,
                        [isSuperAdmin ? customer[0].id : customer[0].company_id, customer[0].name, customer[0].email, hashedPassword, req.user.id]
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
                    if (rawFields.name) { syncSets.push('client_name = ?'); syncVals.push(rawFields.name); }
                    if (rawFields.phone) { syncSets.push('phone = ?'); syncVals.push(rawFields.phone); }
                    if (rawFields.plan) { syncSets.push('plan = ?'); syncVals.push(rawFields.plan); }
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
        const isSuperAdmin = isSuperAdminRole(req.user);
        let table = isSuperAdmin ? 'companies' : 'customers';
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        const cs = companyScope(req);

        let scopingClause = '';
        const scopingParams = [];
        if (!isSuperAdmin) {
            if (isHQ && table === 'customers') {
                scopingClause = ' AND created_by = ?';
                scopingParams.push(req.user.id);
            } else {
                scopingClause = cs.clause;
                scopingParams.push(...cs.params);
            }
        }

        // Fetch record to get email for user deletion
        const query = `SELECT email FROM ${table} WHERE id = ?${isSuperAdmin ? '' : scopingClause}`;
        const queryParams = [req.params.id, ...scopingParams];
        const [records] = await db.query(query, queryParams);

        if (records.length === 0) return errorResponse(res, 'Client record not found.', 404);

        const email = records[0].email;
        if (email) {
            // Delete associated users (Admin/Client for companies, Customer for customers)
            await db.query('DELETE FROM users WHERE email = ? AND role IN ("customer","admin")', [email]);
        }

        // Delete the actual record
        await db.query(`DELETE FROM ${table} WHERE id = ?${isSuperAdmin ? '' : scopingClause}`, queryParams);

        return successResponse(res, null, 'Client record deleted successfully.');
    } catch (err) {
        console.error('Delete error:', err);
        return errorResponse(res, 'Failed to delete record.', 500);
    }
};
