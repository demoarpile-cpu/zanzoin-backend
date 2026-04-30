const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// --- PURCHASE REQUESTS ---
exports.getRequests = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM purchase_requests WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch requests.', 500); }
};

exports.createRequest = async (req, res) => {
    try {
        const { item_name, items, category, quantity, estimated_cost, requester, priority, notes, department } = req.body;
        const companyId = req.companyScope;
        const requesterId = req.user.id;

        let finalItemName = item_name;
        let finalQuantity = quantity;
        if (items && Array.isArray(items) && items.length > 0) {
            if (!finalItemName) finalItemName = items[0].name;
            if (!finalQuantity) finalQuantity = items[0].qty;
        }

        const [result] = await db.query(
            `INSERT INTO purchase_requests (company_id, item_name, items, category, quantity, estimated_cost, requester, requester_id, priority, notes, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, finalItemName || null, JSON.stringify(items || []), category || null, finalQuantity || null, estimated_cost || 0, requester || req.user.name, requesterId, priority || 'Normal', notes || null, department || null]
        );
        await createNotification({ companyId, roleTarget: 'procurement', type: 'order', title: 'New Purchase Request', message: `PR #${result.insertId} — "${finalItemName}" by ${req.user.name || 'Staff'}`, link: '/dashboard/purchase-requests' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'New Purchase Request', message: `PR #${result.insertId} — "${finalItemName}"`, link: '/dashboard/purchase-requests' });
        return successResponse(res, { id: result.insertId }, 'Purchase request created.', 201);
    } catch (err) { 
        console.error('Create request error:', err);
        return errorResponse(res, 'Failed to create request.', 500); 
    }
};

exports.updateRequest = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        
        const mapping = {
            item_name: 'item_name',
            items: 'items',
            category: 'category',
            quantity: 'quantity',
            estimated_cost: 'estimated_cost',
            total: 'estimated_cost',
            requester: 'requester',
            priority: 'priority',
            notes: 'notes',
            status: 'status',
            department: 'department'
        };

        for (const [k, v] of Object.entries(fields)) {
            const dbField = mapping[k];
            if (!dbField) continue;
            
            sets.push(`${dbField} = ?`); 
            values.push(dbField === 'items' ? JSON.stringify(v) : v);
        }

        if (sets.length === 0) return successResponse(res, null, 'No valid fields to update.');

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE purchase_requests SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        
        const status = req.body.status;
        if (status) {
            await createNotification({ companyId: req.companyScope, roleTarget: 'procurement', type: 'order', title: `Purchase Request ${status}`, message: `PR #${req.params.id} status → ${status}`, link: '/dashboard/purchase-requests' });
            await createNotification({ companyId: req.companyScope, roleTarget: 'admin', type: 'order', title: `Purchase Request ${status}`, message: `PR #${req.params.id} updated to ${status}`, link: '/dashboard/purchase-requests' });
        }
        return successResponse(res, { id: req.params.id }, 'Request updated.');
    } catch (err) { 
        console.error('Update request error:', err);
        return errorResponse(res, 'Failed to update request.', 500); 
    }
};

exports.deleteRequest = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM purchase_requests WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Request deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete request.', 500); }
};

// --- QUOTES ---
exports.getQuotes = async (req, res) => {
    try {
        const cf = companyFilter(req, 'q');
        const [rows] = await db.query(`SELECT q.*, v.name as vendor_name FROM quotes q LEFT JOIN vendors v ON q.vendor_id = v.id WHERE 1=1 ${cf.clause} ORDER BY q.created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch quotes.', 500); }
};

exports.createQuote = async (req, res) => {
    try {
        const { 
            vendor_id, vendorId,
            purchase_request_id, purchaseRequestId,
            items, 
            total_amount, total, totalAmount,
            validity_date, validity, validityDate,
            status, notes 
        } = req.body;
        
        const vId = vendor_id || vendorId;
        const prId = purchase_request_id || purchaseRequestId;
        const finalAmount = total_amount || total || totalAmount;
        const finalValidity = validity_date || validity || validityDate;
        const companyId = req.companyScope;

        const [result] = await db.query(
            `INSERT INTO quotes (company_id, vendor_id, purchase_request_id, items, total_amount, validity_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, vId, prId || null, JSON.stringify(items || []), finalAmount || 0, finalValidity || null, status || 'Pending', notes || null]
        );
        await createNotification({ companyId, roleTarget: 'procurement', type: 'order', title: 'New Quote Received', message: `Quote #${result.insertId} — $${finalAmount || 0}`, link: '/dashboard/quotes' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'New Quote Received', message: `Quote #${result.insertId} — $${finalAmount || 0}`, link: '/dashboard/quotes' });
        return successResponse(res, { id: result.insertId }, 'Quote created.', 201);
    } catch (err) {
        console.error('Create quote error:', err);
        return errorResponse(res, 'Failed to create quote.', 500); 
    }
};

exports.updateQuote = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        const mapping = {
            vendorId: 'vendor_id',
            purchaseRequestId: 'purchase_request_id',
            totalAmount: 'total_amount',
            total: 'total_amount',
            validityDate: 'validity_date',
            validity: 'validity_date'
        };

        for (const [k, v] of Object.entries(fields)) {
            if (['id', 'created_at', 'company_id'].includes(k)) continue;
            const fieldName = mapping[k] || k;
            sets.push(`${fieldName} = ?`); 
            values.push(k === 'items' ? JSON.stringify(v) : v);
        }

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Quote updated.');
    } catch (err) {
        console.error('Update quote error:', err);
        return errorResponse(res, 'Failed to update quote.', 500); 
    }
};

exports.deleteQuote = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM quotes WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Quote deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete quote.', 500); }
};

// --- PURCHASE ORDERS ---
exports.getPOs = async (req, res) => {
    try {
        const cf = companyFilter(req, 'po');
        const [rows] = await db.query(`SELECT po.*, v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE 1=1 ${cf.clause} ORDER BY po.created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch POs.', 500); }
};

exports.createPO = async (req, res) => {
    try {
        const { vendorId, vendor_id, items, total_amount, total, totalAmount, notes } = req.body;
        const companyId = req.companyScope;
        const vId = vendor_id || vendorId;
        const finalAmount = total_amount || total || totalAmount || 0;

        const [result] = await db.query(
            `INSERT INTO purchase_orders (company_id, vendor_id, items, total_amount, notes) VALUES (?, ?, ?, ?, ?)`,
            [companyId, vId, JSON.stringify(items || []), finalAmount, notes || null]
        );
        await createNotification({ companyId, roleTarget: 'procurement', type: 'order', title: 'Purchase Order Created', message: `PO #${result.insertId} — $${finalAmount}`, link: '/dashboard/purchase-orders' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'New Purchase Order', message: `PO #${result.insertId} — $${finalAmount}`, link: '/dashboard/purchase-orders' });
        await createNotification({ companyId, roleTarget: 'inventory', type: 'alert', title: 'Incoming PO', message: `PO #${result.insertId} created — prepare for receiving`, link: '/dashboard/purchase-orders' });
        return successResponse(res, { id: result.insertId }, 'PO created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create PO.', 500); }
};

exports.updatePO = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];

        // Map camelCase frontend keys → DB snake_case columns (only columns that exist in purchase_orders)
        const mapping = {
            vendorId:     'vendor_id',
            vendor_id:    'vendor_id',
            totalAmount:  'total_amount',
            total_amount: 'total_amount',
            total:        'total_amount',
            notes:        'notes',
            status:       'status',
            items:        'items',
            paymentTerms: 'payment_terms',
            payment_terms:'payment_terms'
        };

        for (const [k, v] of Object.entries(fields)) {
            const dbField = mapping[k];
            if (!dbField) continue; // ignore unknown / read-only fields
            sets.push(`${dbField} = ?`);
            values.push(dbField === 'items' ? JSON.stringify(Array.isArray(v) ? v : []) : v);
        }

        if (sets.length === 0) return successResponse(res, { id: req.params.id }, 'Nothing to update.');

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'PO updated.');
    } catch (err) {
        console.error('Update PO error:', err.message);
        return errorResponse(res, `Failed to update PO: ${err.message}`, 500);
    }
};

// PUT /api/procurement/po/:id/receive
exports.receiveGoods = async (req, res) => {
    try {
        const { id } = req.params;
        const receivedItems = req.body;
        const cs = companyScope(req);

        const [pos] = await db.query(`SELECT * FROM purchase_orders WHERE id = ?${cs.clause}`, [id, ...cs.params]);
        if (pos.length === 0) return errorResponse(res, 'PO not found.', 404);

        let poItems = typeof pos[0].items === 'string' ? JSON.parse(pos[0].items) : pos[0].items;

        const parsedReceivedItems = Array.isArray(req.body) ? req.body : (req.body.items || []);

        let allReceived = true;
        for (const received of parsedReceivedItems) {
            const item = poItems.find(i => i.id === received.id || i.name === received.name);
            if (item) {
                const qtyReceivedNow = Number(received.receivedQty || received.receivedNow || 0);
                item.received_qty = (item.received_qty || 0) + qtyReceivedNow;
                if (item.received_qty < (item.quantity || item.orderedQty)) allReceived = false;

                // Auto-sync with Inventory Stock
                if (qtyReceivedNow > 0) {
                    const [existing] = await db.query('SELECT id, quantity FROM inventory WHERE name = ? AND company_id = ?', [item.name, pos[0].company_id]);
                    if (existing.length > 0) {
                        const newQty = existing[0].quantity + qtyReceivedNow;
                        const invStatus = newQty > 10 ? 'in_stock' : 'low_stock';
                        await db.query('UPDATE inventory SET quantity = ?, status = ? WHERE id = ?', [newQty, invStatus, existing[0].id]);
                    } else {
                        await db.query('INSERT INTO inventory (company_id, name, category, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?)', 
                        [pos[0].company_id, item.name, item.category || 'General', item.price || 0, qtyReceivedNow, qtyReceivedNow > 10 ? 'in_stock' : 'low_stock']);
                    }
                }
            }
        }

        const newStatus = allReceived ? 'Received' : 'Partially Received';
        await db.query(`UPDATE purchase_orders SET items = ?, status = ? WHERE id = ?${cs.clause}`, [JSON.stringify(poItems), newStatus, id, ...cs.params]);

        await createNotification({ companyId: pos[0].company_id, roleTarget: 'procurement', type: 'delivery', title: `PO #${id} — ${newStatus}`, message: `Goods ${newStatus.toLowerCase()} and inventory updated`, link: '/dashboard/purchase-orders' });
        await createNotification({ companyId: pos[0].company_id, roleTarget: 'inventory', type: 'delivery', title: 'Inventory Updated from PO', message: `Stock updated from PO #${id}`, link: '/dashboard/inventory' });
        await createNotification({ companyId: pos[0].company_id, roleTarget: 'admin', type: 'delivery', title: `PO #${id} — ${newStatus}`, message: `Goods received and inventory synced`, link: '/dashboard/purchase-orders' });

        return successResponse(res, { id, status: newStatus }, 'Goods received and inventory auto-updated.');
    } catch (err) {
        console.error('Receive goods error:', err);
        return errorResponse(res, 'Failed to receive goods or update inventory.', 500);
    }
};
