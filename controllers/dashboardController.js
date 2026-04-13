const db = require('../config/db');
const { companyFilter } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/dashboard/stats
exports.getStats = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const cfAlias = (alias) => {
            if (req.companyScope === null) return { clause: '', params: [] };
            return { clause: ` AND ${alias}.company_id = ?`, params: [req.companyScope] };
        };

        const queries = [
            db.query(`SELECT COUNT(*) as count FROM orders o WHERE 1=1 ${cfAlias('o').clause}`, cfAlias('o').params),
            db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM invoices i WHERE i.status = 'paid' ${cfAlias('i').clause}`, cfAlias('i').params),
            db.query(`SELECT COUNT(*) as count FROM missions m WHERE m.status IN ('pending','assigned','en_route') ${cfAlias('m').clause}`, cfAlias('m').params),
            db.query(`SELECT COUNT(*) as count FROM deliveries d WHERE d.status = 'pending' ${cfAlias('d').clause}`, cfAlias('d').params),
            db.query(`SELECT COUNT(*) as count FROM customers c WHERE 1=1 ${cfAlias('c').clause}`, cfAlias('c').params),
            db.query(`SELECT COUNT(*) as count FROM users u WHERE 1=1 ${cfAlias('u').clause}`, cfAlias('u').params),
            db.query(`SELECT COUNT(*) as count FROM inventory inv WHERE inv.status = 'low_stock' ${cfAlias('inv').clause}`, cfAlias('inv').params),
        ];

        const results = await Promise.all(queries);

        return successResponse(res, {
            totalOrders: results[0][0][0].count,
            totalRevenue: parseFloat(results[1][0][0].total),
            activeMissions: results[2][0][0].count,
            pendingDeliveries: results[3][0][0].count,
            totalClients: results[4][0][0].count,
            totalStaff: results[5][0][0].count,
            lowStockItems: results[6][0][0].count
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        return errorResponse(res, 'Failed to fetch stats.', 500);
    }
};
