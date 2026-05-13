const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

const VALID_ORDER_STATUSES = [
    'created',
    'admin_review',
    'concierge',
    'operation',
    'procurement',
    'inventory',
    'logistics',
    'completed',
    'cancelled',
    'in_progress',
    'delivered'
];

/** Admin may mutate orders for their tenant OR HQ (personal marketplace checkout). */
function orderMutationScope(req) {
    const roleNorm = String(req.user.role || '').toLowerCase().replace(/\s+/g, '');
    if (roleNorm === 'super_admin' || roleNorm === 'superadmin') return { clause: '', params: [] };

    const hqId = parseInt(process.env.DEFAULT_COMPANY_ID || 1, 10);
    const isHQUser = (req.user.company_id == hqId || !req.user.company_id || req.companyScope == hqId);

    // Treat HQ staff (Operations, Logistics, etc.) as platform-level managers for their specific stages.
    // HQ Admins should be able to mutate all platform/marketplace orders (company 1) as well as any they specifically created.
    if (isHQUser) {
        if (roleNorm === 'admin' || roleNorm === 'manager') {
            return { clause: ' AND (company_id = 1 OR company_id IS NULL OR created_by = ?)', params: [req.user.id] };
        }
        if (['operation', 'operations', 'logistics', 'procurement', 'inventory', 'concierge'].includes(roleNorm)) {
            return { clause: '', params: [] }; // Ops / logistics / concierge see HQ fulfilment queues
        }
    }

    if (!req.companyScope) return { clause: '', params: [] };
    const role = roleNorm;
    return companyScope(req);
}

/** Map UI / shorthand labels to orders.status ENUM values (MySQL strict ENUM). */
function normalizeOrderStatus(input) {
    if (input === undefined || input === null || String(input).trim() === '') return null;
    const raw = String(input).trim().toLowerCase().replace(/\s+/g, '_');
    const aliases = {
        // Human-readable labels from UI / tables
        submitted: 'created',
        pending_review: 'admin_review',
        in_operations: 'operation',
        operations: 'operation',
        logistics_dispatch: 'logistics',
        out_for_delivery: 'logistics',
        pending: 'admin_review',
        processing: 'operation',
        in_progress: 'operation',
        approved: 'operation',
        shipped: 'logistics',
        in_transit: 'logistics',
        dispatch: 'logistics',
        delivered: 'completed',
        fulfilled: 'completed',
        done: 'completed',
        canceled: 'cancelled',
        reject: 'cancelled',
        processing_legacy: 'operation',
        processing_review: 'admin_review'
    };
    const resolved = aliases[raw] || raw;
    if (VALID_ORDER_STATUSES.includes(resolved)) return resolved;
    return null;
}

function normalizePositiveInt(val) {
    if (val == null || val === '') return null;
    const n = Number(val);
    if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
    return Math.trunc(n);
}

/** MySQL DATE columns reject JS Date stringification; coerce Date / ISO / `YYYY-MM-DD` → `YYYY-MM-DD`. */
function toMysqlDateOnly(val) {
    if (val == null || val === '') {
        return new Date().toISOString().slice(0, 10);
    }
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.slice(0, 10);
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return new Date().toISOString().slice(0, 10);
}

async function resolveReadableCompanyScope(req) {
    const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
    if (roleNorm === 'super_admin' || roleNorm === 'superadmin') return null;

    let companyId =
        normalizePositiveInt(req.companyScope) ||
        normalizePositiveInt(req.user?.company_id) ||
        normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);

    if (companyId) {
        const [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);
        if (!companyRows.length) companyId = null;
    }
    if (!companyId) {
        const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
        if (anyCompany.length) companyId = anyCompany[0].id;
    }
    return companyId || null;
}

async function resolveValidCompanyId({ requestedCompanyId, scopedCompanyId, fallbackCompanyId }) {
    let companyId = requestedCompanyId || scopedCompanyId || fallbackCompanyId;
    if (!companyId) return null;

    let [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);

    if (!companyRows.length && requestedCompanyId) {
        // Frontend can accidentally send user/customer ids where company_id is expected.
        const [userRows] = await db.query('SELECT company_id FROM users WHERE id = ? LIMIT 1', [requestedCompanyId]);
        const userCompanyId = normalizePositiveInt(userRows?.[0]?.company_id);
        if (userCompanyId) {
            const [resolvedCompanyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [userCompanyId]);
            if (resolvedCompanyRows.length) {
                companyId = userCompanyId;
                companyRows = resolvedCompanyRows;
            }
        }
    }

    if (!companyRows.length && requestedCompanyId) {
        const [customerRows] = await db.query('SELECT company_id FROM customers WHERE id = ? LIMIT 1', [requestedCompanyId]);
        const customerCompanyId = normalizePositiveInt(customerRows?.[0]?.company_id);
        if (customerCompanyId) {
            const [resolvedCompanyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [customerCompanyId]);
            if (resolvedCompanyRows.length) {
                companyId = customerCompanyId;
                companyRows = resolvedCompanyRows;
            }
        }
    }

    if (!companyRows.length && scopedCompanyId) {
        const [scopedRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [scopedCompanyId]);
        if (scopedRows.length) {
            companyId = scopedCompanyId;
            companyRows = scopedRows;
        }
    }

    if (!companyRows.length && fallbackCompanyId) {
        const [fallbackRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [fallbackCompanyId]);
        if (fallbackRows.length) {
            companyId = fallbackCompanyId;
            companyRows = fallbackRows;
        }
    }

    if (!companyRows.length) {
        const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
        if (anyCompany.length) {
            companyId = anyCompany[0].id;
            companyRows = anyCompany;
        }
    }

    return companyRows.length ? companyId : null;
}

// GET /api/orders
exports.getAll = async (req, res) => {
    try {
        let role = typeof req.user.role === 'string' ? req.user.role.toLowerCase().replace(/\s+/g, '') : req.user.role;
        if (role === 'superadmin') role = 'super_admin';
        // JWT / UI historically used plural "operations"; DB stage is singular "operation"
        if (role === 'operations') role = 'operation';
        const effectiveCompanyScope = await resolveReadableCompanyScope(req);
        let whereClause = 'WHERE 1=1';
        const params = [];

        // Super admin sees everything (no tenant filter)
        // Super admin or HQ Admin sees everything (no tenant filter)
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);
        if (role === 'super_admin') {
            // no additional filter
        } else if (role === 'admin' && isHQ) {
            // HQ Admin should see all marketplace/platform orders (company 1) plus any they specifically created
            whereClause += ' AND (o.company_id = 1 OR o.company_id IS NULL OR o.created_by = ?)';
            params.push(req.user.id);
        }
        // Customer sees only their own orders (by email or created_by)
        else if (role === 'customer') {
            whereClause += ' AND (o.created_by = ? OR u_creator.email = ?)';
            params.push(req.user.id, req.user.email);
        }
        // Tenant-scoped roles (admin, operation, logistics, etc.) see their company.
        // Admins also see DEFAULT_COMPANY_ID (HQ) orders so personal/marketplace checkout is visible alongside tenant work.
        else if (effectiveCompanyScope) {
            const hqId = parseInt(process.env.DEFAULT_COMPANY_ID || 1, 10);
            if (role === 'admin') {
                whereClause += ' AND (o.company_id = ? OR o.company_id = ?)';
                params.push(effectiveCompanyScope, hqId);
            } else if (role === 'operation' || role === 'logistics' || role === 'concierge') {
                // Marketplace / personal checkout is stored on HQ (DEFAULT_COMPANY_ID). Tenant operations,
                // logistics, and concierge users must still see HQ fulfilment / triage rows.
                whereClause +=
                    ' AND (o.company_id = ? OR (o.company_id = ? AND (o.current_stage IN (\'operation\',\'logistics\',\'concierge\') OR o.status IN (\'operation\',\'logistics\',\'concierge\'))))';
                params.push(effectiveCompanyScope, hqId);
            } else {
                whereClause += ' AND o.company_id = ?';
                params.push(effectiveCompanyScope);
            }

            // Operational staff sees only orders assigned to them or at their stage
            // Role must match DB ENUM spelling (singular "operation").
            const stageRoles = ['operation', 'procurement', 'inventory', 'logistics', 'concierge'];
            if (stageRoles.includes(role)) {
                // Marketplace checkout lands in logistics; ops staff often use role "operation" — include logistics queue so orders are visible.
                if (role === 'operation') {
                    whereClause +=
                        ' AND (o.assigned_to = ? OR (o.current_stage IN (\'operation\',\'logistics\') OR o.status IN (\'operation\',\'logistics\')))';
                    params.push(req.user.id);
                } else if (role === 'logistics') {
                    // All logistics users in the tenant see the full dispatch queue (unassigned + any assignee).
                    whereClause += ' AND (o.current_stage = \'logistics\' OR o.status = \'logistics\')';
                } else if (role === 'concierge') {
                    whereClause += ' AND (o.current_stage = \'concierge\' OR o.status = \'concierge\')';
                } else {
                    whereClause += ' AND (o.assigned_to = ? OR o.current_stage = ? OR o.status = ?)';
                    params.push(req.user.id, role, role);
                }
            }
        }

        const [rows] = await db.query(
            `SELECT o.*,
                    c.name AS customer_name,
                    v.name AS vendor_name,
                    u.name AS assigned_to_name,
                    u_creator.name AS created_by_name,
                    u_creator.email AS created_by_email
             FROM orders o
             LEFT JOIN customers c    ON o.customer_id = c.id
             LEFT JOIN vendors v      ON o.vendor_id = v.id
             LEFT JOIN users u        ON o.assigned_to = u.id
             LEFT JOIN users u_creator ON o.created_by = u_creator.id
             ${whereClause}
             ORDER BY o.created_at DESC`,
            params
        );

        // Normalize: ensure customer_name / client_name is always populated
        const normalised = rows.map(o => ({
            ...o,
            customer_name: o.client_name || o.customer_name || o.created_by_name || 'Customer',
        }));

        return successResponse(res, normalised);
    } catch (err) {
        console.error('Get orders error:', err);
        return errorResponse(res, 'Failed to fetch orders.', 500);
    }
};

// GET /api/orders/:id
exports.getById = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT o.*, c.name as customer_name, v.name as vendor_name, u.name as assigned_to_name
             FROM orders o
             LEFT JOIN customers c ON o.customer_id = c.id
             LEFT JOIN vendors v ON o.vendor_id = v.id
             LEFT JOIN users u ON o.assigned_to = u.id
             WHERE o.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return errorResponse(res, 'Order not found.', 404);

        // Get order items
        const [items] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
        // Get flow logs
        const [logs] = await db.query(
            `SELECT ofl.*, u.name as assigned_to_name, u2.name as assigned_by_name
             FROM order_flow_logs ofl
             LEFT JOIN users u ON ofl.assigned_to = u.id
             LEFT JOIN users u2 ON ofl.assigned_by = u2.id
             WHERE ofl.order_id = ? ORDER BY ofl.started_at ASC`,
            [req.params.id]
        );

        return successResponse(res, { ...rows[0], order_items: items, flow_logs: logs });
    } catch (err) {
        return errorResponse(res, 'Failed to fetch order.', 500);
    }
};

// POST /api/orders
exports.create = async (req, res) => {
    try {
        let {
            customer_id,
            vendor_id,
            type,
            items,
            notes,
            due_date,
            order_date,
            request_date,
            location,
            delivery_address,
            order_kind,
            delivery_mode,
            book_chauffeur,
            custom_request_category,
            concierge_member,
            delivery_instructions
        } = req.body;
        const hqCompanyId = normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);
        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isCustomerRole = roleNorm === 'customer';
        const rawRequestedCompanyId = normalizePositiveInt(req.body.company_id || req.body.companyId);
        const scopedCompanyId = normalizePositiveInt(req.companyScope);
        // Tenant users should create orders inside their own workspace by default.
        // This prevents "POST success but GET empty" when frontend accidentally sends customer/user IDs as company_id.
        const requestedCompanyId =
            roleNorm !== 'super_admin' && roleNorm !== 'customer'
                ? (scopedCompanyId || rawRequestedCompanyId)
                : rawRequestedCompanyId;
        let companyId = requestedCompanyId || scopedCompanyId || hqCompanyId;

        // Personal (customer) checkout always lands on HQ company — ignores mistaken client company_id so admin + logistics queues stay consistent.
        if (isCustomerRole) {
            companyId = await resolveValidCompanyId({
                requestedCompanyId: hqCompanyId,
                scopedCompanyId,
                fallbackCompanyId: hqCompanyId
            });
        } else if (!companyId) {
            return errorResponse(res, 'Company ID required.', 400);
        }

        // Calculate total from items
        let totalAmount = 0;
        let parsedItems = [];
        try {
            parsedItems = typeof items === 'string' ? JSON.parse(items) : (items || []);
            if (!Array.isArray(parsedItems)) parsedItems = [];
        } catch {
            return errorResponse(res, 'Invalid items: must be a JSON array or array of line items.', 400);
        }
        parsedItems.forEach(item => {
            totalAmount += (parseFloat(item.price || item.unit_price || 0) * parseInt(item.qty || item.quantity || 1));
        });

        let notesMerged = notes || null;
        const metaParts = [];
        if (delivery_mode) metaParts.push(`delivery_mode:${String(delivery_mode).trim()}`);
        if (book_chauffeur === true || book_chauffeur === 'true' || book_chauffeur === 1 || book_chauffeur === '1') metaParts.push('book_chauffeur:yes');
        if (custom_request_category) metaParts.push(`custom_request:${String(custom_request_category).trim()}`);
        if (concierge_member === true || concierge_member === 'true') metaParts.push('concierge_member:yes');
        if (order_kind) metaParts.push(`order_kind:${String(order_kind).trim()}`);
        if (metaParts.length) {
            const block = `[request_meta] ${metaParts.join('; ')}`;
            notesMerged = notesMerged ? `${notesMerged}\n\n${block}` : block;
        }

        // Persist explicit calendar dates (fixes wrong/missing dates on storefront)
        let orderDateVal = order_date || request_date || null;
        if (orderDateVal !== null && orderDateVal !== '') {
            const od = String(orderDateVal).split('T')[0];
            orderDateVal = /^\d{4}-\d{2}-\d{2}$/.test(od) ? od : null;
        } else {
            orderDateVal = null;
        }

        let dueDateVal = due_date || null;
        if (dueDateVal) {
            const dd = String(dueDateVal).split('T')[0];
            dueDateVal = /^\d{4}-\d{2}-\d{2}$/.test(dd) ? dd : null;
        }

        // Customer orders: marketplace + bespoke start in admin queue by default. Admin approves, then may assign to ops / logistics / driver — never skip straight to logistics on create (UI maps logistics → "Out for Delivery").
        const kindRaw = String(order_kind || '').toLowerCase().trim();
        const typeNorm = String(type || '').toLowerCase();
        const isCustomRequest =
            kindRaw === 'custom_request' ||
            typeNorm.includes('custom request') ||
            typeNorm.includes('bespoke');

        let initialStatus = 'created';
        let initialStage = 'created';

        if (isCustomerRole) {
            if (isCustomRequest) {
                initialStatus = 'admin_review';
                initialStage = 'admin_review';
            } else {
                // Marketplace checkout → admin queue first (same as frontend payload); delivery row created when admin moves order to logistics.
                const fromBody = normalizeOrderStatus(req.body.status);
                const allowedFirst = ['admin_review', 'created'];
                if (fromBody && allowedFirst.includes(fromBody)) {
                    initialStatus = fromBody;
                    initialStage = fromBody;
                } else {
                    initialStatus = 'admin_review';
                    initialStage = 'admin_review';
                }
            }
        } else {
            initialStatus = 'created';
            initialStage = 'created';
        }

        // delivery_address: accept from body or fall back to location field
        const finalDeliveryAddress = delivery_address || location || null;
        const deliveryInstructionsVal =
            delivery_instructions != null && String(delivery_instructions).trim() !== ''
                ? String(delivery_instructions).trim()
                : null;

        companyId = await resolveValidCompanyId({
            requestedCompanyId,
            scopedCompanyId,
            fallbackCompanyId: hqCompanyId
        });
        if (!companyId) {
            return errorResponse(res, 'Invalid company_id: no matching company. Seed a company or fix company_id.', 400);
        }

        // orders.customer_id → customers.id (NOT users.id). Frontend often sends user id for customers.
        let resolvedCustomerId =
            customer_id !== undefined && customer_id !== null && customer_id !== ''
                ? parseInt(customer_id, 10)
                : null;
        if (Number.isNaN(resolvedCustomerId)) resolvedCustomerId = null;

        if (isCustomerRole) {
            resolvedCustomerId = null;
            const em = (req.user.email || '').trim().toLowerCase();
            if (em) {
                const [custMatch] = await db.query(
                    `SELECT id FROM customers 
                     WHERE LOWER(TRIM(email)) = ? 
                       AND (company_id = ? OR company_id IS NULL)
                     ORDER BY (company_id <=> ?) DESC, id DESC LIMIT 1`,
                    [em, companyId, companyId]
                );
                if (custMatch.length) resolvedCustomerId = custMatch[0].id;
            }
        } else if (resolvedCustomerId != null) {
            const [custOk] = await db.query('SELECT id FROM customers WHERE id = ?', [resolvedCustomerId]);
            if (custOk.length === 0) resolvedCustomerId = null;
        }

        let resolvedVendorId =
            vendor_id !== undefined && vendor_id !== null && vendor_id !== ''
                ? parseInt(vendor_id, 10)
                : null;
        if (Number.isNaN(resolvedVendorId)) resolvedVendorId = null;
        if (resolvedVendorId != null) {
            const [vOk] = await db.query('SELECT id FROM vendors WHERE id = ?', [resolvedVendorId]);
            if (vOk.length === 0) resolvedVendorId = null;
        }

        // Schema: orders has location (not delivery_address) and no client_name; use created_by join for label
        const [result] = await db.query(
            `INSERT INTO orders
             (company_id, customer_id, vendor_id, created_by, type, items, notes,
              delivery_instructions, location, total_amount, status, current_stage, order_date, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                companyId, resolvedCustomerId, resolvedVendorId, req.user.id,
                type || 'Custom Order', JSON.stringify(parsedItems), notesMerged,
                deliveryInstructionsVal,
                finalDeliveryAddress,
                totalAmount, initialStatus, initialStage,
                orderDateVal || new Date().toISOString().slice(0, 10),
                dueDateVal || null
            ]
        );

        const orderId = result.insertId;

        // Insert order items
        for (const item of parsedItems) {
            const itemTotal = (parseFloat(item.price || item.unit_price || 0) * parseInt(item.qty || item.quantity || 1));
            await db.query(
                `INSERT INTO order_items (order_id, product_name, category, qty, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, item.name || item.product_name || 'Item', item.category || null, item.qty || item.quantity || 1, item.price || item.unit_price || 0, itemTotal]
            );
        }

        // Create first flow log (stage matches initial workflow position)
        await db.query(
            `INSERT INTO order_flow_logs (order_id, stage, assigned_by, status) VALUES (?, ?, ?, 'completed')`,
            [orderId, initialStage, req.user.id]
        );

        // Notify admin about new order
        await createNotification({
            companyId: companyId,
            roleTarget: 'admin',
            type: 'order',
            title: 'New Order Created',
            message: `Order #${orderId} created by ${req.user.name || req.user.email} — $${totalAmount}`,
            link: '/dashboard/orders'
        });
        // Also notify super_admin
        await createNotification({
            roleTarget: 'super_admin',
            type: 'order',
            title: 'New Order Created',
            message: `Order #${orderId} created — $${totalAmount}`,
            link: '/dashboard/orders'
        });

        // Delivery mission: only when order is already in logistics (staff flows). Marketplace customer orders stay admin_review until admin assigns logistics.
        if (initialStage === 'logistics') {
            await db.query(
                `INSERT INTO deliveries (company_id, order_id, mission_type, status, pickup_location, drop_location, package_details, delivery_date) 
                 VALUES (?, ?, 'Delivery', 'pending', 'Warehouse / HQ', ?, ?, ?)`,
                [companyId, orderId, finalDeliveryAddress || 'Customer Address', JSON.stringify(parsedItems), toMysqlDateOnly(orderDateVal)]
            );

            await createNotification({
                companyId: companyId,
                roleTarget: 'logistics',
                type: 'order',
                title: `New Marketplace Order #${orderId}`,
                message: `Delivery mission automatically created — total $${totalAmount}`,
                link: '/dashboard/deliveries'
            });
        }

        return successResponse(res, { id: orderId, total_amount: totalAmount }, 'Order created.', 201);
    } catch (err) {
        console.error('Create order error:', err);
        const hint = err.sqlMessage || err.message;
        const msg =
            process.env.NODE_ENV === 'production'
                ? 'Failed to create order.'
                : `Failed to create order. ${hint}`;
        return errorResponse(res, msg, 500);
    }
};

// PUT /api/orders/:id
exports.update = async (req, res) => {
    try {
        const allowedFields = [
            'customer_id',
            'vendor_id',
            'type',
            'items',
            'notes',
            'location',
            'delivery_instructions',
            'total_amount',
            'due_date',
            'order_date',
            'client_id',
            'company_id'
        ];
        const fkFields = ['customer_id', 'vendor_id', 'client_id', 'company_id'];
        const sets = [];
        const values = [];

        for (const [key, val] of Object.entries(req.body)) {
            if (!allowedFields.includes(key)) continue;
            // Convert empty strings to null for foreign key fields
            const cleanVal = (fkFields.includes(key) && (val === '' || val === undefined)) ? null : val;
            const dbKey = key === 'client_id' ? 'customer_id' : key;
            if (dbKey === 'company_id' && cleanVal != null) {
                const resolvedCompanyId = await resolveValidCompanyId({
                    requestedCompanyId: normalizePositiveInt(cleanVal),
                    scopedCompanyId: normalizePositiveInt(req.companyScope),
                    fallbackCompanyId: normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1)
                });
                if (!resolvedCompanyId) {
                    return errorResponse(res, 'Invalid company_id: no matching company.', 400);
                }
                sets.push(`${dbKey} = ?`);
                values.push(resolvedCompanyId);
                continue;
            }
            sets.push(`${dbKey} = ?`);
            values.push(key === 'items' ? JSON.stringify(cleanVal) : cleanVal);
        }
        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);
        const cs = orderMutationScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);

        // Notify about order update
        const [orderRow] = await db.query('SELECT company_id FROM orders WHERE id = ?', [req.params.id]);
        const orderCompanyId = orderRow[0]?.company_id;
        await createNotification({ companyId: orderCompanyId, roleTarget: 'admin', type: 'order', title: 'Order Updated', message: `Order #${req.params.id} has been updated by ${req.user.name || 'Admin'}`, link: '/dashboard/orders' });
        await createNotification({ companyId: orderCompanyId, roleTarget: 'customer', type: 'order', title: 'Your Order Updated', message: `Order #${req.params.id} details have been updated`, link: '/dashboard/client-orders' });

        return successResponse(res, { id: req.params.id }, 'Order updated.');
    } catch (err) {
        console.error('Update order error:', err);
        return errorResponse(res, 'Failed to update order.', 500);
    }
};

// PATCH /api/orders/:id/status
exports.updateStatus = async (req, res) => {
    try {
        const normalized = normalizeOrderStatus(req.body.status);
        if (!normalized) {
            return errorResponse(
                res,
                `Invalid order status. Use one of: ${VALID_ORDER_STATUSES.join(', ')} (aliases: pending→admin_review, processing→operation, shipped→logistics, delivered→completed).`,
                400
            );
        }
        const cs = orderMutationScope(req);
        const [upd] = await db.query(
            `UPDATE orders SET status = ?, current_stage = ? WHERE id = ?${cs.clause}`,
            [normalized, normalized, req.params.id, ...cs.params]
        );

        if (!upd.affectedRows) {
            return errorResponse(res, 'Order not found or not in your company scope.', 404);
        }

        // Notify about status change
        const [orderRow] = await db.query('SELECT company_id FROM orders WHERE id = ?', [req.params.id]);
        const orderCompanyId = orderRow[0]?.company_id;
        await createNotification({ companyId: orderCompanyId, roleTarget: 'customer', type: 'order', title: 'Order Status Updated', message: `Order #${req.params.id} is now "${normalized}"`, link: '/dashboard/client-orders' });
        await createNotification({ companyId: orderCompanyId, roleTarget: 'admin', type: 'order', title: `Order #${req.params.id} — ${normalized}`, message: `Status changed to ${normalized} by ${req.user.name || 'System'}`, link: '/dashboard/orders' });
        await createNotification({ roleTarget: 'super_admin', type: 'order', title: `Order #${req.params.id} — ${normalized}`, message: `Status changed to ${normalized}`, link: '/dashboard/clients' });

        return successResponse(res, { id: req.params.id, status: normalized }, 'Order status updated.');
    } catch (err) {
        return errorResponse(res, 'Failed to update status.', 500);
    }
};

// PUT /api/orders/:id/assign — WORKFLOW: Assign order to next stage
exports.assignToStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, assigned_to, notes } = req.body;

        const validStages = ['admin_review', 'concierge', 'operation', 'procurement', 'inventory', 'logistics', 'completed'];
        if (!validStages.includes(stage)) {
            return errorResponse(res, `Invalid stage. Valid: ${validStages.join(', ')}`, 400);
        }

        // Get current order
        const cs = orderMutationScope(req);
        const [orders] = await db.query(`SELECT * FROM orders WHERE id = ?${cs.clause}`, [id, ...cs.params]);
        if (orders.length === 0) return errorResponse(res, 'Order not found.', 404);

        const order = orders[0];

        // Complete previous stage log
        await db.query(
            `UPDATE order_flow_logs SET status = 'completed', completed_at = NOW()
             WHERE order_id = ? AND stage = ? AND status != 'completed'`,
            [id, order.current_stage]
        );

        // Update order
        const newStatus = stage === 'completed' ? 'completed' : stage;
        const assigneeId =
            assigned_to === undefined || assigned_to === null || assigned_to === '' ? null : assigned_to;

        await db.query(
            `UPDATE orders SET status = ?, current_stage = ?, assigned_to = ? WHERE id = ?`,
            [newStatus, stage, assigneeId, id]
        );

        // Create new flow log (started_at avoids strict-mode default errors when column exists)
        try {
            await db.query(
                `INSERT INTO order_flow_logs (order_id, stage, assigned_to, assigned_by, status, notes, started_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [id, stage, assigneeId, req.user.id, stage === 'completed' ? 'completed' : 'pending', notes || null]
            );
        } catch (flErr) {
            if (flErr.code === 'ER_BAD_FIELD_ERROR') {
                await db.query(
                    `INSERT INTO order_flow_logs (order_id, stage, assigned_to, assigned_by, status, notes) VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, stage, assigneeId, req.user.id, stage === 'completed' ? 'completed' : 'pending', notes || null]
                );
            } else {
                throw flErr;
            }
        }

        // Notify the target role about stage transition
        const notifyRole =
            stage === 'completed' ? 'admin' : stage === 'concierge' ? 'concierge' : stage === 'logistics' ? 'logistics' : stage;
        await createNotification({
            companyId: order.company_id,
            roleTarget: notifyRole,
            type: 'order',
            title: `Order #${id} — ${stage.charAt(0).toUpperCase() + stage.slice(1)}`,
            message: `Order #${id} has been moved to ${stage} stage by ${req.user.name || 'Admin'}`,
            link: '/dashboard/orders'
        });

        // Marketplace path: when admin sends order to logistics, ensure a delivery mission exists so the whole logistics team sees it on Deliveries.
        if (stage === 'logistics') {
            const [existingDel] = await db.query('SELECT id FROM deliveries WHERE order_id = ? LIMIT 1', [id]);
            if (!existingDel.length) {
                let parsedItems = [];
                try {
                    parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
                    if (!Array.isArray(parsedItems)) parsedItems = [];
                } catch {
                    parsedItems = [];
                }
                const dropAddr = order.delivery_address || order.location || 'Customer Address';
                const orderDay = toMysqlDateOnly(order.order_date);
                const instr = order.delivery_instructions || null;
                const fee = parseFloat(order.total_amount) || 0;
                try {
                    await db.query(
                        `INSERT INTO deliveries (company_id, order_id, mission_type, status, pickup_location, drop_location, package_details, delivery_date, delivery_instructions, delivery_fee)
                         VALUES (?, ?, 'Delivery', 'pending', 'Warehouse / HQ', ?, ?, ?, ?, ?)`,
                        [
                            order.company_id,
                            id,
                            dropAddr,
                            JSON.stringify(parsedItems),
                            orderDay,
                            instr,
                            fee
                        ]
                    );
                } catch (insErr) {
                    // Duplicate row (race with client) — treat as success
                    if (insErr.code === 'ER_DUP_ENTRY') {
                        /* delivery already linked to this order */
                    } else if (insErr.code === 'ER_BAD_FIELD_ERROR') {
                        await db.query(
                            `INSERT INTO deliveries (company_id, order_id, mission_type, status, pickup_location, drop_location, package_details, delivery_date)
                             VALUES (?, ?, 'Delivery', 'pending', 'Warehouse / HQ', ?, ?, ?)`,
                            [order.company_id, id, dropAddr, JSON.stringify(parsedItems), orderDay]
                        );
                    } else if (
                        insErr.code === 'WARN_DATA_TRUNCATED' ||
                        insErr.errno === 1265 ||
                        (insErr.sqlMessage && String(insErr.sqlMessage).includes('Incorrect'))
                    ) {
                        // Some DBs use title-cased status ENUM (e.g. Pending) — retry common variants
                        await db.query(
                            `INSERT INTO deliveries (company_id, order_id, mission_type, status, pickup_location, drop_location, package_details, delivery_date, delivery_instructions, delivery_fee)
                             VALUES (?, ?, 'Delivery', 'Pending', 'Warehouse / HQ', ?, ?, ?, ?, ?)`,
                            [
                                order.company_id,
                                id,
                                dropAddr,
                                JSON.stringify(parsedItems),
                                orderDay,
                                instr,
                                fee
                            ]
                        );
                    } else {
                        throw insErr;
                    }
                }
                await createNotification({
                    companyId: order.company_id,
                    roleTarget: 'logistics',
                    type: 'order',
                    title: `Dispatch queue: Order #${id}`,
                    message: `Order #${id} approved — assign a driver in Deliveries.`,
                    link: '/dashboard/deliveries'
                });
            }
        }

        return successResponse(res, { id, stage, assigned_to }, `Order assigned to ${stage} stage.`);
    } catch (err) {
        console.error('Assign stage error:', err);
        const hint = err.sqlMessage || err.message || '';
        const msg =
            process.env.NODE_ENV === 'production'
                ? 'Failed to assign order.'
                : `Failed to assign order. ${hint}`.trim();
        return errorResponse(res, msg, 500);
    }
};

// GET /api/orders/:id/flow-logs
exports.getFlowLogs = async (req, res) => {
    try {
        const [logs] = await db.query(
            `SELECT ofl.*, u.name as assigned_to_name, u2.name as assigned_by_name
             FROM order_flow_logs ofl
             LEFT JOIN users u ON ofl.assigned_to = u.id
             LEFT JOIN users u2 ON ofl.assigned_by = u2.id
             WHERE ofl.order_id = ? ORDER BY ofl.started_at ASC`,
            [req.params.id]
        );
        return successResponse(res, logs);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch flow logs.', 500);
    }
};

// GET /api/orders/by-company/:companyId — Super Admin: get orders for a specific company
exports.getByCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const [rows] = await db.query(
            `SELECT o.*, c.name as customer_name, v.name as vendor_name, u.name as assigned_to_name
             FROM orders o
             LEFT JOIN customers c ON o.customer_id = c.id
             LEFT JOIN vendors v ON o.vendor_id = v.id
             LEFT JOIN users u ON o.assigned_to = u.id
             WHERE o.company_id = ?
             ORDER BY o.created_at DESC`,
            [companyId]
        );
        return successResponse(res, rows);
    } catch (err) {
        console.error('Get orders by company error:', err);
        return errorResponse(res, 'Failed to fetch orders.', 500);
    }
};

// DELETE /api/orders/:id
exports.remove = async (req, res) => {
    try {
        const cs = orderMutationScope(req);
        const [orderRow] = await db.query('SELECT company_id FROM orders WHERE id = ?', [req.params.id]);
        const orderCompanyId = orderRow[0]?.company_id;

        await db.query(`DELETE FROM orders WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);

        await createNotification({ companyId: orderCompanyId, roleTarget: 'admin', type: 'alert', title: 'Order Cancelled', message: `Order #${req.params.id} has been removed by ${req.user.name || 'Admin'}`, link: '/dashboard/orders' });
        await createNotification({ companyId: orderCompanyId, roleTarget: 'customer', type: 'alert', title: 'Order Cancelled', message: `Your Order #${req.params.id} has been cancelled`, link: '/dashboard/client-orders' });

        return successResponse(res, null, 'Order deleted.');
    } catch (err) {
        return errorResponse(res, 'Failed to delete order.', 500);
    }
};

// POST /api/orders/convert/:orderId — Convert order to project
exports.convertToProject = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { name, description, location } = req.body;

        // Handle both snake_case and camelCase from frontend
        const managerId = req.body.manager_id || req.body.managerId || req.user.id;
        const startDate = req.body.start_date || req.body.startDate || req.body.start || null;
        const companyId = req.body.company_id || req.body.companyId || req.companyScope;
        const status = req.body.status || 'planned';

        // Map frontend status to backend enum values
        let dbStatus = 'planned';
        if (status.toLowerCase() === 'pending' || status.toLowerCase() === 'planned') {
            dbStatus = 'planned';
        } else if (status.toLowerCase() === 'active' || status.toLowerCase() === 'in_progress' || status.toLowerCase() === 'in progress') {
            dbStatus = 'in_progress';
        } else if (status.toLowerCase() === 'completed') {
            dbStatus = 'completed';
        } else if (status.toLowerCase() === 'on_hold' || status.toLowerCase() === 'on hold') {
            dbStatus = 'on_hold';
        }

        const [result] = await db.query(
            `INSERT INTO projects (company_id, order_id, name, description, manager_id, location, status, start_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, orderId, name, description || null, managerId, location || null, dbStatus, startDate]
        );

        // Update order status
        await db.query(`UPDATE orders SET status = 'in_progress', current_stage = 'completed' WHERE id = ?`, [orderId]);

        // Get project with joins (Note: table is companies if exists, else it might have been clients)
        const [projects] = await db.query(
            `SELECT p.*, COALESCE(c.name, cu.name) as client_name FROM projects p 
             LEFT JOIN companies c ON p.company_id = c.id 
             LEFT JOIN customers cu ON p.company_id = cu.id
             WHERE p.id = ?`,
            [result.insertId]
        );

        await createNotification({ companyId, roleTarget: 'operation', type: 'order', title: 'Order Converted to Project', message: `Order #${orderId} → Project "${name}"`, link: '/dashboard/projects' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'Project Created from Order', message: `Order #${orderId} converted to project "${name}"`, link: '/dashboard/projects' });

        return successResponse(res, projects[0] || { id: result.insertId }, 'Order converted to project.', 201);
    } catch (err) {
        console.error('Convert to project error:', err);
        return errorResponse(res, 'Failed to convert order.', 500);
    }
};

// GET /api/orders/projects/all
exports.getAllProjects = async (req, res) => {
    try {
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);

        let cf;
        if (role === 'super_admin') {
            cf = { clause: '', params: [] };
        } else if (role === 'admin' && isHQ) {
            cf = { clause: ' AND p.manager_id = ?', params: [req.user.id] }; // or created_by if projects had it
        } else {
            cf = companyFilter(req, 'p');
        }

        const [rows] = await db.query(
            `SELECT p.*, 
                    COALESCE(c.name, cu.name) as client_name, 
                    u.name as manager_name
             FROM projects p
             LEFT JOIN companies c ON p.company_id = c.id
             LEFT JOIN customers cu ON p.company_id = cu.id
             LEFT JOIN users u ON p.manager_id = u.id
             WHERE 1=1 ${cf.clause} ORDER BY p.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch projects.', 500);
    }
};

// POST /api/orders/projects
exports.createProject = async (req, res) => {
    try {
        const { name, description, manager_id, startDate, location, status, company_id } = req.body;
        if (!name || !String(name).trim()) {
            return errorResponse(res, 'Project name is required.', 400);
        }

        const normalizePositiveInt = (val) => {
            if (val == null || val === '') return null;
            const n = Number(val);
            if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
            return Math.trunc(n);
        };

        const requestedCompanyId = normalizePositiveInt(company_id);
        const scopedCompanyId = normalizePositiveInt(req.companyScope);
        const fallbackCompanyId = normalizePositiveInt(process.env.DEFAULT_COMPANY_ID || 1);

        let companyId = requestedCompanyId || scopedCompanyId || fallbackCompanyId;
        if (!companyId) {
            return errorResponse(res, 'Valid company_id is required.', 400);
        }

        let [companyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [companyId]);

        if (!companyRows.length && requestedCompanyId) {
            // Frontend can sometimes send customer/user id in clientId field.
            // Try resolving that id to a company_id from users/customers tables.
            const [userRows] = await db.query('SELECT company_id FROM users WHERE id = ? LIMIT 1', [requestedCompanyId]);
            const userCompanyId = normalizePositiveInt(userRows?.[0]?.company_id);
            if (userCompanyId) {
                const [resolvedCompanyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [userCompanyId]);
                if (resolvedCompanyRows.length) {
                    companyId = userCompanyId;
                    companyRows = resolvedCompanyRows;
                }
            }
        }

        if (!companyRows.length && requestedCompanyId) {
            const [customerRows] = await db.query('SELECT company_id FROM customers WHERE id = ? LIMIT 1', [requestedCompanyId]);
            const customerCompanyId = normalizePositiveInt(customerRows?.[0]?.company_id);
            if (customerCompanyId) {
                const [resolvedCompanyRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [customerCompanyId]);
                if (resolvedCompanyRows.length) {
                    companyId = customerCompanyId;
                    companyRows = resolvedCompanyRows;
                }
            }
        }

        if (!companyRows.length && scopedCompanyId) {
            const [scopedRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [scopedCompanyId]);
            if (scopedRows.length) {
                companyId = scopedCompanyId;
                companyRows = scopedRows;
            }
        }

        if (!companyRows.length && fallbackCompanyId) {
            const [fallbackRows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [fallbackCompanyId]);
            if (fallbackRows.length) {
                companyId = fallbackCompanyId;
                companyRows = fallbackRows;
            }
        }

        if (!companyRows.length) {
            const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
            if (anyCompany.length) {
                companyId = anyCompany[0].id;
                companyRows = anyCompany;
            }
        }

        if (!companyRows.length) {
            return errorResponse(res, 'Invalid company_id. Company not found. Create at least one company first.', 400);
        }

        let managerId = normalizePositiveInt(manager_id) || normalizePositiveInt(req.user?.id);
        if (managerId) {
            const [mgrRows] = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [managerId]);
            if (!mgrRows.length) managerId = normalizePositiveInt(req.user?.id);
        }

        const statusRaw = String(status || 'planned').toLowerCase().trim().replace(/\s+/g, '_');
        const projectStatus = ['planned', 'in_progress', 'completed', 'on_hold'].includes(statusRaw) ? statusRaw : 'planned';
        const startDateVal = startDate ? String(startDate).split('T')[0] : null;

        const [result] = await db.query(
            `INSERT INTO projects (company_id, name, description, manager_id, location, status, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, String(name).trim(), description || null, managerId || null, location || null, projectStatus, startDateVal || null]
        );

        const [projects] = await db.query(`SELECT p.*, COALESCE(c.name, cu.name) as client_name FROM projects p LEFT JOIN companies c ON p.company_id = c.id LEFT JOIN customers cu ON p.company_id = cu.id WHERE p.id = ?`, [result.insertId]);
        return successResponse(res, projects[0] || { id: result.insertId }, 'Project created.', 201);
    } catch (err) {
        console.error('Create project error:', err);
        return errorResponse(res, `Failed to create project. ${err.sqlMessage || err.message || ''}`.trim(), 500);
    }
};

// PUT /api/orders/projects/:id
exports.updateProject = async (req, res) => {
    try {
        const { name, description, status, location, start_date, manager_id } = req.body;
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);

        let cs;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(
            `UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status), location = COALESCE(?, location), start_date = COALESCE(?, start_date), manager_id = COALESCE(?, manager_id) WHERE id = ?${cs.clause}`,
            [name, description, status, location, start_date, manager_id, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Project updated.');
    } catch (err) {
        return errorResponse(res, 'Failed to update project.', 500);
    }
};

// DELETE /api/orders/projects/:id
exports.deleteProject = async (req, res) => {
    try {
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);

        let cs;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(`DELETE FROM projects WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Project deleted.');
    } catch (err) {
        return errorResponse(res, 'Failed to delete project.', 500);
    }
};
