const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// GET /api/orders
exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req, 'o');
        const role = req.user.role;

        let extraWhere = '';
        const extraParams = [];

        // Customer sees only their orders (by customer record email OR created by this user)
        if (role === 'customer') {
            extraWhere = ' AND (o.customer_id IN (SELECT id FROM customers WHERE email = ?) OR o.created_by = ?)';
            extraParams.push(req.user.email, req.user.id);
        }

        // Staff sees only orders assigned to them at current stage
        if (['operation', 'procurement', 'inventory', 'logistics'].includes(role)) {
            extraWhere = ' AND (o.assigned_to = ? OR o.current_stage = ?)';
            extraParams.push(req.user.id, role);
        }

        const [rows] = await db.query(
            `SELECT o.*, c.name as customer_name, v.name as vendor_name, u.name as assigned_to_name
             FROM orders o
             LEFT JOIN customers c ON o.customer_id = c.id
             LEFT JOIN vendors v ON o.vendor_id = v.id
             LEFT JOIN users u ON o.assigned_to = u.id
             WHERE 1=1 ${cf.clause} ${extraWhere}
             ORDER BY o.created_at DESC`,
            [...cf.params, ...extraParams]
        );
        return successResponse(res, rows);
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
        let { customer_id, vendor_id, type, items, notes, status, due_date, location } = req.body;
        const companyId = req.body.company_id || req.companyScope;

        if (!companyId) return errorResponse(res, 'Company ID required.', 400);

        // Auto-resolve customer_id for customer role
        if (req.user.role === 'customer') {
            // Try to find matching record in customers table
            const [custRows] = await db.query(
                'SELECT id FROM customers WHERE email = ? AND company_id = ? LIMIT 1',
                [req.user.email, companyId]
            );
            if (custRows.length > 0) {
                customer_id = custRows[0].id;
            } else {
                // Personal client: no record in customers table, set null (created_by tracks the user)
                customer_id = null;
            }
        }

        // Calculate total from items
        let totalAmount = 0;
        const parsedItems = typeof items === 'string' ? JSON.parse(items) : (items || []);
        parsedItems.forEach(item => {
            totalAmount += (parseFloat(item.price || item.unit_price || 0) * parseInt(item.qty || item.quantity || 1));
        });

        // Customer role orders go directly to admin_review queue
        const isCustomerRole = req.user.role === 'customer';
        const initialStatus = isCustomerRole ? 'admin_review' : 'created';

        const [result] = await db.query(
            `INSERT INTO orders (company_id, customer_id, vendor_id, created_by, type, items, notes, location, total_amount, status, current_stage, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, customer_id || null, vendor_id || null, req.user.id, type || 'Custom Order', JSON.stringify(parsedItems), notes || null, location || null, totalAmount, initialStatus, initialStatus, due_date || null]
        );

        const orderId = result.insertId;

        // Insert order items
        for (const item of parsedItems) {
            const itemTotal = (parseFloat(item.price || item.unit_price || 0) * parseInt(item.qty || item.quantity || 1));
            await db.query(
                `INSERT INTO order_items (order_id, product_name, category, qty, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, item.name || item.product_name, item.category || null, item.qty || item.quantity || 1, item.price || item.unit_price || 0, itemTotal]
            );
        }

        // Create first flow log
        await db.query(
            `INSERT INTO order_flow_logs (order_id, stage, assigned_by, status) VALUES (?, 'created', ?, 'completed')`,
            [orderId, req.user.id]
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

        return successResponse(res, { id: orderId, total_amount: totalAmount }, 'Order created.', 201);
    } catch (err) {
        console.error('Create order error:', err);
        return errorResponse(res, 'Failed to create order.', 500);
    }
};

// PUT /api/orders/:id
exports.update = async (req, res) => {
    try {
        const allowedFields = ['customer_id', 'vendor_id', 'type', 'items', 'notes', 'location', 'total_amount', 'due_date', 'client_id', 'company_id'];
        const fkFields = ['customer_id', 'vendor_id', 'client_id', 'company_id'];
        const sets = [];
        const values = [];

        for (const [key, val] of Object.entries(req.body)) {
            if (!allowedFields.includes(key)) continue;
            // Convert empty strings to null for foreign key fields
            const cleanVal = (fkFields.includes(key) && (val === '' || val === undefined)) ? null : val;
            const dbKey = key === 'client_id' ? 'customer_id' : key;
            sets.push(`${dbKey} = ?`);
            values.push(key === 'items' ? JSON.stringify(cleanVal) : cleanVal);
        }
        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);
        const cs = companyScope(req);
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
        const { status } = req.body;
        const cs = companyScope(req);
        await db.query(`UPDATE orders SET status = ? WHERE id = ?${cs.clause}`, [status, req.params.id, ...cs.params]);

        // Notify about status change
        const [orderRow] = await db.query('SELECT company_id FROM orders WHERE id = ?', [req.params.id]);
        const orderCompanyId = orderRow[0]?.company_id;
        await createNotification({ companyId: orderCompanyId, roleTarget: 'customer', type: 'order', title: 'Order Status Updated', message: `Order #${req.params.id} is now "${status}"`, link: '/dashboard/client-orders' });
        await createNotification({ companyId: orderCompanyId, roleTarget: 'admin', type: 'order', title: `Order #${req.params.id} — ${status}`, message: `Status changed to ${status} by ${req.user.name || 'System'}`, link: '/dashboard/orders' });
        await createNotification({ roleTarget: 'super_admin', type: 'order', title: `Order #${req.params.id} — ${status}`, message: `Status changed to ${status}`, link: '/dashboard/clients' });

        return successResponse(res, { id: req.params.id, status }, 'Order status updated.');
    } catch (err) {
        return errorResponse(res, 'Failed to update status.', 500);
    }
};

// PUT /api/orders/:id/assign — WORKFLOW: Assign order to next stage
exports.assignToStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, assigned_to, notes } = req.body;

        const validStages = ['admin_review', 'operation', 'procurement', 'inventory', 'logistics', 'completed'];
        if (!validStages.includes(stage)) {
            return errorResponse(res, `Invalid stage. Valid: ${validStages.join(', ')}`, 400);
        }

        // Get current order
        const cs = companyScope(req);
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
        await db.query(
            `UPDATE orders SET status = ?, current_stage = ?, assigned_to = ? WHERE id = ?`,
            [newStatus, stage, assigned_to || null, id]
        );

        // Create new flow log
        await db.query(
            `INSERT INTO order_flow_logs (order_id, stage, assigned_to, assigned_by, status, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, stage, assigned_to || null, req.user.id, stage === 'completed' ? 'completed' : 'pending', notes || null]
        );

        // Notify the target role about stage transition
        await createNotification({
            companyId: order.company_id,
            roleTarget: stage === 'completed' ? 'admin' : stage,
            type: 'order',
            title: `Order #${id} — ${stage.charAt(0).toUpperCase() + stage.slice(1)}`,
            message: `Order #${id} has been moved to ${stage} stage by ${req.user.name || 'Admin'}`,
            link: '/dashboard/orders'
        });

        return successResponse(res, { id, stage, assigned_to }, `Order assigned to ${stage} stage.`);
    } catch (err) {
        console.error('Assign stage error:', err);
        return errorResponse(res, 'Failed to assign order.', 500);
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
        const cs = companyScope(req);
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
            `SELECT p.*, c.name as client_name FROM projects p LEFT JOIN companies c ON p.company_id = c.id WHERE p.id = ?`,
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
        const cf = companyFilter(req, 'p');
        const [rows] = await db.query(
            `SELECT p.*, c.name as client_name, u.name as manager_name
             FROM projects p
             LEFT JOIN companies c ON p.company_id = c.id
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
        const companyId = company_id || req.companyScope;

        const [result] = await db.query(
            `INSERT INTO projects (company_id, name, description, manager_id, location, status, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, description || null, manager_id || req.user.id, location || null, status || 'planned', startDate || null]
        );

        const [projects] = await db.query(`SELECT p.*, c.name as client_name FROM projects p LEFT JOIN companies c ON p.company_id = c.id WHERE p.id = ?`, [result.insertId]);
        return successResponse(res, projects[0] || { id: result.insertId }, 'Project created.', 201);
    } catch (err) {
        return errorResponse(res, 'Failed to create project.', 500);
    }
};

// PUT /api/orders/projects/:id
exports.updateProject = async (req, res) => {
    try {
        const { name, description, status, location, start_date, manager_id } = req.body;
        const cs = companyScope(req);
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
        const cs = companyScope(req);
        await db.query(`DELETE FROM projects WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Project deleted.');
    } catch (err) {
        return errorResponse(res, 'Failed to delete project.', 500);
    }
};
