const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// --- INVOICES ---
exports.getInvoices = async (req, res) => {
    try {
        const cf = companyFilter(req, 'i');
        const [rows] = await db.query(
            `SELECT i.*, c.name as client_name FROM invoices i LEFT JOIN companies c ON i.client_id = c.id WHERE 1=1 ${cf.clause} ORDER BY i.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch invoices.', 500); }
};

exports.createInvoice = async (req, res) => {
    try {
        const { order_id, client_id, amount, due_date, status } = req.body;
        // For super_admin: companyScope is null, so resolve from client_id or order
        let companyId = req.companyScope;
        if (!companyId && client_id) {
            companyId = client_id;
        }
        if (!companyId && order_id) {
            const [orderRows] = await db.query('SELECT company_id FROM orders WHERE id = ?', [order_id]);
            if (orderRows.length > 0) companyId = orderRows[0].company_id;
        }
        const [result] = await db.query(
            `INSERT INTO invoices (company_id, order_id, client_id, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, order_id || null, client_id || null, amount, due_date || null, status || 'unpaid']
        );
        // Notify admin + client about new invoice
        await createNotification({
            companyId,
            roleTarget: 'admin',
            type: 'alert',
            title: 'Invoice Generated',
            message: `Invoice #${result.insertId} created — $${amount}`,
            link: '/dashboard/invoices'
        });
        await createNotification({
            companyId,
            roleTarget: 'customer',
            type: 'alert',
            title: 'New Invoice',
            message: `Invoice #${result.insertId} — $${amount} has been generated for your order`,
            link: '/dashboard/invoices'
        });
        await createNotification({
            roleTarget: 'super_admin',
            type: 'alert',
            title: 'Invoice Generated',
            message: `Invoice #${result.insertId} — $${amount}`,
            link: '/dashboard/clients'
        });

        return successResponse(res, { id: result.insertId }, 'Invoice created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create invoice.', 500); }
};

exports.updateInvoice = async (req, res) => {
    try {
        const { amount, due_date, status } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE invoices SET amount = COALESCE(?, amount), due_date = COALESCE(?, due_date), status = COALESCE(?, status) WHERE id = ?${cs.clause}`,
            [amount, due_date, status, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Invoice updated.');
    } catch (err) { return errorResponse(res, 'Failed to update invoice.', 500); }
};

exports.deleteInvoice = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM invoices WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Invoice deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete invoice.', 500); }
};

// POST /api/finance/invoices/:id/pay
exports.payInvoice = async (req, res) => {
    try {
        const { amount, payment_method, transaction_id } = req.body;
        const invoiceId = req.params.id;
        const cs = companyScope(req);

        // Verify invoice belongs to company
        const [check] = await db.query(`SELECT id FROM invoices WHERE id = ?${cs.clause}`, [invoiceId, ...cs.params]);
        if (check.length === 0) return errorResponse(res, 'Invoice not found.', 404);

        // Record payment
        await db.query(
            `INSERT INTO payments (invoice_id, amount, payment_method, transaction_id) VALUES (?, ?, ?, ?)`,
            [invoiceId, amount, payment_method || 'Cash', transaction_id || `TXN-${Date.now()}`]
        );

        // Update invoice paid_amount
        await db.query(`UPDATE invoices SET paid_amount = paid_amount + ? WHERE id = ?`, [amount, invoiceId]);

        // Check if fully paid
        const [inv] = await db.query('SELECT amount, paid_amount FROM invoices WHERE id = ?', [invoiceId]);
        if (inv.length > 0) {
            const newStatus = inv[0].paid_amount >= inv[0].amount ? 'paid' : 'partial';
            await db.query('UPDATE invoices SET status = ? WHERE id = ?', [newStatus, invoiceId]);
        }

        // Notify on payment
        const payStatus = (inv.length > 0 && inv[0].paid_amount >= inv[0].amount) ? 'Fully Paid' : 'Partial Payment';
        await createNotification({
            companyId: req.companyScope,
            roleTarget: 'admin',
            type: 'alert',
            title: `Payment Received — ${payStatus}`,
            message: `$${amount} received for Invoice #${invoiceId} via ${payment_method || 'Cash'}`,
            link: '/dashboard/invoices'
        });
        await createNotification({
            roleTarget: 'super_admin',
            type: 'alert',
            title: `Payment Received — $${amount}`,
            message: `Invoice #${invoiceId} — ${payStatus}`,
            link: '/dashboard/invoices'
        });

        return successResponse(res, { id: invoiceId }, 'Payment recorded.');
    } catch (err) { return errorResponse(res, 'Payment failed.', 500); }
};

// GET /api/finance/my-payroll
exports.getMyPayroll = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query(
            `SELECT p.*, u.name as user_name FROM payroll p LEFT JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.payment_date DESC`,
            [userId]
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch payroll.', 500); }
};
