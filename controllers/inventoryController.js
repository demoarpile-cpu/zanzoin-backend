const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

exports.getAll = async (req, res) => {
    try {
        const cf = companyFilter(req, 'i');
        const role = req.user.role;

        // Customer role: show only Marketplace items from all companies (global catalog)
        let whereClause = `WHERE 1=1 ${cf.clause}`;
        let params = [...cf.params];
        if (role === 'customer') {
            whereClause = `WHERE i.inventory_type = 'Marketplace'`;
            params = [];
        }

        const [rows] = await db.query(
            `SELECT i.*, w.name as warehouse_name, cust.name as client_name
             FROM inventory i
             LEFT JOIN warehouses w ON i.warehouse_id = w.id
             LEFT JOIN customers cust ON i.client_id = cust.id
             ${whereClause} ORDER BY i.created_at DESC`,
            params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch inventory.', 500); }
};

exports.getAlerts = async (req, res) => {
    try {
        const cf = companyFilter(req, 'i');
        const [rows] = await db.query(
            `SELECT i.*, w.name as warehouse_name FROM inventory i LEFT JOIN warehouses w ON i.warehouse_id = w.id WHERE i.status IN ('low_stock','out_of_stock') ${cf.clause} ORDER BY i.quantity ASC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch alerts.', 500); }
};

exports.create = async (req, res) => {
    try {
        const { name, sku, category, price, quantity, warehouse_id, vendor_id, client_id, inventory_type } = req.body;
        const companyId = req.body.company_id || req.companyScope;
        const qty = parseInt(quantity) || 0;
        const threshold = req.body.threshold || 10;
        const status = qty === 0 ? 'out_of_stock' : qty <= threshold ? 'low_stock' : 'in_stock';

        const [result] = await db.query(
            `INSERT INTO inventory (company_id, name, sku, category, price, quantity, threshold, warehouse_id, vendor_id, client_id, inventory_type, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, sku || `SKU-${Date.now()}`, category || null, price || 0, qty, threshold, warehouse_id || null, vendor_id || null, client_id || null, inventory_type || 'Marketplace', status]
        );
        return successResponse(res, { id: result.insertId, name, quantity: qty, status }, 'Inventory item created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create item.', 500); }
};

exports.update = async (req, res) => {
    try {
        const { name, category, price, quantity, warehouse_id, vendor_id, client_id } = req.body;
        const qty = quantity !== undefined ? parseInt(quantity) : undefined;
        let status;
        if (qty !== undefined) {
            const threshold = req.body.threshold || 10;
            status = qty === 0 ? 'out_of_stock' : qty <= threshold ? 'low_stock' : 'in_stock';
        }

        const cs = companyScope(req);
        await db.query(
            `UPDATE inventory SET name = COALESCE(?, name), category = COALESCE(?, category), price = COALESCE(?, price),
             quantity = COALESCE(?, quantity), warehouse_id = COALESCE(?, warehouse_id), vendor_id = COALESCE(?, vendor_id),
             client_id = COALESCE(?, client_id) ${status ? ', status = ?' : ''} WHERE id = ?${cs.clause}`,
            [name, category, price, qty, warehouse_id, vendor_id, client_id, ...(status ? [status] : []), req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Item updated.');
    } catch (err) { return errorResponse(res, 'Failed to update item.', 500); }
};

exports.remove = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM inventory WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Item deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete item.', 500); }
};

// POST /api/inventory/:id/adjust
exports.adjust = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, type, reason, reference_type, reference_id } = req.body;

        const cs = companyScope(req);
        const [items] = await db.query(`SELECT * FROM inventory WHERE id = ?${cs.clause}`, [id, ...cs.params]);
        if (items.length === 0) return errorResponse(res, 'Item not found.', 404);

        const item = items[0];
        const adjustQty = parseInt(quantity) || 0;
        let newQty;

        if (type === 'entry') {
            newQty = item.quantity + adjustQty;
        } else if (type === 'issue' || type === 'loss') {
            newQty = Math.max(0, item.quantity - adjustQty);
        } else {
            newQty = adjustQty; // direct adjustment
        }

        const threshold = item.threshold || 10;
        const status = newQty === 0 ? 'out_of_stock' : newQty <= threshold ? 'low_stock' : 'in_stock';

        await db.query(`UPDATE inventory SET quantity = ?, status = ? WHERE id = ?${cs.clause}`, [newQty, status, id, ...cs.params]);

        // Log the movement
        await db.query(
            `INSERT INTO inventory_movements (inventory_id, type, quantity, reference_type, reference_id, reason, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, type, adjustQty, reference_type || null, reference_id || null, reason || null, req.user.id]
        );

        // Notify on low stock or out of stock
        if (status === 'low_stock' || status === 'out_of_stock') {
            const alertTitle = status === 'out_of_stock' ? 'OUT OF STOCK' : 'Low Stock Alert';
            await createNotification({
                companyId: req.companyScope,
                roleTarget: 'inventory',
                type: 'alert',
                title: `${alertTitle}: ${item.name}`,
                message: `${item.name} is now at ${newQty} units (threshold: ${item.threshold || 10})`,
                link: '/dashboard/inventory'
            });
            await createNotification({
                companyId: req.companyScope,
                roleTarget: 'admin',
                type: 'alert',
                title: `${alertTitle}: ${item.name}`,
                message: `${item.name} — ${newQty} units remaining`,
                link: '/dashboard/inventory'
            });
        }

        return successResponse(res, { id: parseInt(id), name: item.name, quantity: newQty, status }, 'Stock adjusted.');
    } catch (err) {
        console.error('Adjust error:', err);
        return errorResponse(res, 'Stock adjustment failed.', 500);
    }
};

// --- WAREHOUSES ---
exports.getWarehouses = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM warehouses WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch warehouses.', 500); }
};

exports.createWarehouse = async (req, res) => {
    try {
        const { name, location, capacity, manager_id } = req.body;
        const companyId = req.body.company_id || req.companyScope;
        const [result] = await db.query(
            `INSERT INTO warehouses (company_id, name, location, capacity, manager_id) VALUES (?, ?, ?, ?, ?)`,
            [companyId, name, location || null, parseInt(capacity) || 0, manager_id || null]
        );
        return successResponse(res, { id: result.insertId, name }, 'Warehouse created.', 201);
    } catch (err) { 
        console.error('Create warehouse error:', err);
        return errorResponse(res, 'Failed to create warehouse.', 500); 
    }
};

exports.updateWarehouse = async (req, res) => {
    try {
        const { name, location, capacity, manager_id, status } = req.body;
        const cs = companyScope(req);
        
        let validStatus = status;
        if (status && !['active', 'inactive', 'maintenance'].includes(status.toLowerCase())) {
            validStatus = 'active'; // fallback for invalid enums like 'Stable'
        }

        await db.query(
            `UPDATE warehouses SET name = COALESCE(?, name), location = COALESCE(?, location), capacity = COALESCE(?, capacity), manager_id = COALESCE(?, manager_id), status = COALESCE(?, status) WHERE id = ?${cs.clause}`,
            [name, location, capacity !== undefined ? parseInt(capacity) || 0 : undefined, manager_id, validStatus ? validStatus.toLowerCase() : undefined, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Warehouse updated.');
    } catch (err) { return errorResponse(res, 'Failed to update warehouse.', 500); }
};

exports.deleteWarehouse = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM warehouses WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Warehouse deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete warehouse.', 500); }
};
