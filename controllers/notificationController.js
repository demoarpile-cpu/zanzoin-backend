const db = require('../config/db');
const { companyFilter } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/notifications — get notifications for current user
exports.getAll = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const companyId = req.companyScope;

        let query = `SELECT * FROM notifications WHERE (user_id = ? OR (role_target = ? AND (company_id = ? OR company_id IS NULL)))`;
        const params = [userId, role, companyId];

        // Super admin sees all notifications targeted to super_admin role
        if (role === 'super_admin') {
            query = `SELECT * FROM notifications WHERE (user_id = ? OR role_target = 'super_admin' OR role_target = 'all')`;
            params.length = 0;
            params.push(userId);
        }

        query += ` ORDER BY created_at DESC LIMIT 50`;
        const [rows] = await db.query(query, params);
        return successResponse(res, rows);
    } catch (err) {
        console.error('Get notifications error:', err);
        return errorResponse(res, 'Failed to fetch notifications.', 500);
    }
};

// GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const companyId = req.companyScope;

        let query = `SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE AND (user_id = ? OR (role_target = ? AND (company_id = ? OR company_id IS NULL)))`;
        const params = [userId, role, companyId];

        if (role === 'super_admin') {
            query = `SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE AND (user_id = ? OR role_target = 'super_admin' OR role_target = 'all')`;
            params.length = 0;
            params.push(userId);
        }

        const [rows] = await db.query(query, params);
        return successResponse(res, { unread: rows[0].count });
    } catch (err) {
        return errorResponse(res, 'Failed to fetch unread count.', 500);
    }
};

// PATCH /api/notifications/:id/read — mark single as read
exports.markRead = async (req, res) => {
    try {
        await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = ?`, [req.params.id]);
        return successResponse(res, null, 'Marked as read.');
    } catch (err) {
        return errorResponse(res, 'Failed to mark as read.', 500);
    }
};

// PATCH /api/notifications/read-all — mark all as read for current user
exports.markAllRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const companyId = req.companyScope;

        if (role === 'super_admin') {
            await db.query(
                `UPDATE notifications SET is_read = TRUE WHERE (user_id = ? OR role_target = 'super_admin' OR role_target = 'all')`,
                [userId]
            );
        } else {
            await db.query(
                `UPDATE notifications SET is_read = TRUE WHERE (user_id = ? OR (role_target = ? AND (company_id = ? OR company_id IS NULL)))`,
                [userId, role, companyId]
            );
        }
        return successResponse(res, null, 'All marked as read.');
    } catch (err) {
        return errorResponse(res, 'Failed to mark all as read.', 500);
    }
};

// Utility: create a notification (called from other controllers)
exports.createNotification = async ({ companyId, userId, roleTarget, type, title, message, link }) => {
    try {
        await db.query(
            `INSERT INTO notifications (company_id, user_id, role_target, type, title, message, link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId || null, userId || null, roleTarget || null, type || 'info', title, message || null, link || null]
        );
    } catch (err) {
        console.error('Create notification error:', err);
    }
};
