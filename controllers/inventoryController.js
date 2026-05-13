const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

function parsePositiveIntOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

exports.getAll = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cf;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req, 'i');
        }

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
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cf;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req, 'i');
        }
        const [rows] = await db.query(
            `SELECT i.*, w.name as warehouse_name FROM inventory i LEFT JOIN warehouses w ON i.warehouse_id = w.id WHERE i.status IN ('low_stock','out_of_stock') ${cf.clause} ORDER BY i.quantity ASC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch alerts.', 500); }
};

exports.create = async (req, res) => {
    try {
        const b = req.body;
        const name = b.name;
        const sku = b.sku;
        const category = b.category;
        const price = b.price !== undefined && b.price !== '' ? parseFloat(b.price) : 0;
        const qty = b.quantity !== undefined && b.quantity !== '' ? parseInt(b.quantity, 10) : 0;
        const warehouse_id = parsePositiveIntOrNull(b.warehouse_id);
        const vendor_id = parsePositiveIntOrNull(b.vendor_id);
        const client_id = parsePositiveIntOrNull(b.client_id);
        const inventory_type = b.inventory_type || 'Marketplace';

        let companyId = b.company_id || req.companyScope;
        if (companyId == 1) companyId = null;

        const threshold = b.threshold != null && b.threshold !== '' ? parseInt(b.threshold, 10) : 10;
        const quantity = Number.isFinite(qty) ? qty : 0;
        const status = quantity === 0 ? 'out_of_stock' : quantity <= threshold ? 'low_stock' : 'in_stock';

        let image_url = b.image_url && String(b.image_url).trim() !== '' ? String(b.image_url).trim() : null;
        if (req.file && req.file.filename) {
            image_url = `/uploads/${req.file.filename}`;
        }

        if (!name || String(name).trim() === '') {
            return errorResponse(res, 'Product name is required.', 400);
        }

        const { size, color, material, specifications, description } = b;

        const [result] = await db.query(
            `INSERT INTO inventory (company_id, name, sku, category, price, quantity, threshold, warehouse_id, vendor_id, client_id, inventory_type, status, image_url, size, color, material, specifications, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name.trim(), sku || `SKU-${Date.now()}`, category || null, price || 0, quantity, threshold, warehouse_id, vendor_id, client_id, inventory_type, status, image_url, size || null, color || null, material || null, specifications || null, description || null]
        );
        return successResponse(res, { id: result.insertId, name: name.trim(), quantity, status, image_url }, 'Inventory item created.', 201);
    } catch (err) {
        console.error('Inventory create error:', err);
        return errorResponse(res, err.message || 'Failed to create item.', 500);
    }
};

exports.update = async (req, res) => {
    try {
        const b = req.body;
        const { name, category, price, quantity, warehouse_id, vendor_id, client_id } = b;
        const qty = quantity !== undefined && quantity !== '' ? parseInt(quantity, 10) : undefined;
        let status;
        if (qty !== undefined && Number.isFinite(qty)) {
            const threshold = b.threshold != null && b.threshold !== '' ? parseInt(b.threshold, 10) : 10;
            status = qty === 0 ? 'out_of_stock' : qty <= threshold ? 'low_stock' : 'in_stock';
        }

        const whId = warehouse_id !== undefined ? parsePositiveIntOrNull(warehouse_id) : undefined;
        const vId = vendor_id !== undefined ? parsePositiveIntOrNull(vendor_id) : undefined;
        const cId = client_id !== undefined ? parsePositiveIntOrNull(client_id) : undefined;

        let imagePatch = '';
        const imageParams = [];
        if (req.file && req.file.filename) {
            imagePatch = ', image_url = ?';
            imageParams.push(`/uploads/${req.file.filename}`);
        } else if (b.image_url !== undefined) {
            imagePatch = ', image_url = ?';
            imageParams.push(b.image_url && String(b.image_url).trim() !== '' ? String(b.image_url).trim() : null);
        }

        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        const { size, color, material, specifications, description } = b;

        await db.query(
            `UPDATE inventory SET name = COALESCE(?, name), category = COALESCE(?, category), price = COALESCE(?, price),
             quantity = COALESCE(?, quantity), warehouse_id = COALESCE(?, warehouse_id), vendor_id = COALESCE(?, vendor_id),
             client_id = COALESCE(?, client_id), size = COALESCE(?, size), color = COALESCE(?, color),
             material = COALESCE(?, material), specifications = COALESCE(?, specifications), description = COALESCE(?, description)
             ${status ? ', status = ?' : ''}${imagePatch} WHERE id = ?${cs.clause}`,
            [name, category, price, qty, whId, vId, cId, size, color, material, specifications, description, ...(status ? [status] : []), ...imageParams, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Item updated.');
    } catch (err) {
        console.error('Inventory update error:', err);
        return errorResponse(res, err.message || 'Failed to update item.', 500);
    }
};

exports.remove = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(`DELETE FROM inventory WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Item deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete item.', 500); }
};

// POST /api/inventory/:id/adjust
exports.adjust = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, type, reason, reference_type, reference_id } = req.body;

        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
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
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cf;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req);
        }
        const [rows] = await db.query(`SELECT * FROM warehouses WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch warehouses.', 500); }
};

exports.createWarehouse = async (req, res) => {
    try {
        const { name, location, capacity, manager_id } = req.body;
        let companyId = req.body.company_id || req.companyScope;
        
        // HQ Fix
        if (companyId == 1) companyId = null;

        const cap = parseInt(capacity) || 0;
        const [result] = await db.query(
            `INSERT INTO warehouses (company_id, name, location, capacity, manager_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, name, location || null, cap, manager_id || null, 'active']
        );
        return successResponse(res, { 
            id: result.insertId, 
            company_id: companyId,
            name, 
            location: location || null, 
            capacity: cap, 
            manager_id: manager_id || null,
            status: 'active'
        }, 'Warehouse created.', 201);
    } catch (err) { 
        console.error('Create warehouse error:', err);
        return errorResponse(res, 'Failed to create warehouse.', 500); 
    }
};

exports.updateWarehouse = async (req, res) => {
    try {
        const { name, location, capacity, manager_id, status } = req.body;
        
        let validStatus = status;
        if (status && !['active', 'inactive', 'maintenance'].includes(status.toLowerCase())) {
            validStatus = 'active'; // fallback for invalid enums
        }

        const cap = capacity !== undefined ? parseInt(capacity) || 0 : undefined;

        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(
            `UPDATE warehouses SET name = COALESCE(?, name), location = COALESCE(?, location), capacity = COALESCE(?, capacity), manager_id = COALESCE(?, manager_id), status = COALESCE(?, status) WHERE id = ?${cs.clause}`,
            [name, location, cap, manager_id, validStatus ? validStatus.toLowerCase() : undefined, req.params.id, ...cs.params]
        );

        // Fetch the updated warehouse to return full data
        const [rows] = await db.query(`SELECT * FROM warehouses WHERE id = ?`, [req.params.id]);
        return successResponse(res, rows[0], 'Warehouse updated.');
    } catch (err) { 
        console.error('Update warehouse error:', err);
        return errorResponse(res, 'Failed to update warehouse.', 500); 
    }
};

exports.deleteWarehouse = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(`DELETE FROM warehouses WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Warehouse deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete warehouse.', 500); }
};

exports.getMovements = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                im.*, 
                i.name as item_name,
                u.name as performed_by_name
            FROM inventory_movements im
            LEFT JOIN inventory i ON im.inventory_id = i.id
            LEFT JOIN users u ON im.performed_by = u.id
            ORDER BY im.created_at DESC
            LIMIT 500
        `);
        return successResponse(res, rows);
    } catch (err) {
        console.error('Get movements error:', err);
        return errorResponse(res, 'Failed to fetch stock movements.', 500);
    }
};
