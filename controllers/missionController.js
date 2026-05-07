const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

function normalizePositiveInt(val) {
    if (val == null || val === '') return null;
    const n = Number(val);
    if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return null;
    return Math.trunc(n);
}

async function resolveValidCompanyId(...candidates) {
    for (const c of candidates) {
        const id = normalizePositiveInt(c);
        if (!id) continue;
        const [rows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [id]);
        if (rows.length) return id;
    }
    const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
    return anyCompany.length ? anyCompany[0].id : null;
}

exports.getAll = async (req, res) => {
    try {
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);
        
        let cf;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req, 'm');
        }

        const [rows] = await db.query(
            `SELECT m.*, 
                    u.name as driver_name, 
                    v.plate_number,
                    p.name as project_name
             FROM missions m
             LEFT JOIN users u ON m.assigned_driver = u.id 
             LEFT JOIN vehicles v ON m.vehicle_id = v.id
             LEFT JOIN projects p ON m.project_id = p.id
             WHERE 1=1 ${cf.clause} ORDER BY m.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch missions.', 500); }
};

exports.convertFromOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { mission_type, destination_type, event_date, notes } = req.body;
        const [orderRows] = await db.query('SELECT company_id FROM orders WHERE id = ? LIMIT 1', [orderId]);
        const orderCompanyId = orderRows[0]?.company_id;
        const companyId = await resolveValidCompanyId(
            req.companyScope,
            req.user?.company_id,
            orderCompanyId,
            process.env.DEFAULT_COMPANY_ID || 1
        );
        if (!companyId) return errorResponse(res, 'No valid company mapping for mission.', 400);

        const [result] = await db.query(
            `INSERT INTO missions (company_id, order_id, mission_type, destination_type, event_date, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, orderId, mission_type || 'Delivery', destination_type || null, event_date || null, notes || null]
        );

        await db.query(`UPDATE orders SET status = 'in_progress' WHERE id = ?`, [orderId]);

        const [missions] = await db.query(
            `SELECT m.*, u.name as driver_name, v.plate_number FROM missions m LEFT JOIN users u ON m.assigned_driver = u.id LEFT JOIN vehicles v ON m.vehicle_id = v.id WHERE m.id = ?`,
            [result.insertId]
        );
        // Notify operation + logistics about new mission
        await createNotification({
            companyId,
            roleTarget: 'operation',
            type: 'order',
            title: 'New Mission Launched',
            message: `Mission #${result.insertId} created from Order #${orderId} — ${mission_type || 'Delivery'}`,
            link: '/dashboard/missions'
        });
        await createNotification({
            companyId,
            roleTarget: 'logistics',
            type: 'order',
            title: 'Mission Awaiting Dispatch',
            message: `Mission #${result.insertId} — ${mission_type || 'Delivery'} ready for assignment`,
            link: '/dashboard/missions'
        });

        return successResponse(res, missions[0] || { id: result.insertId }, 'Mission created from order.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create mission.', 500); }
};

exports.convertFromProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { mission_type, destination_type, event_date, notes } = req.body;
        // Get project info
        const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (projects.length === 0) return errorResponse(res, 'Project not found.', 404);
        const project = projects[0];
        const companyId = await resolveValidCompanyId(
            req.companyScope,
            req.user?.company_id,
            project.company_id,
            process.env.DEFAULT_COMPANY_ID || 1
        );
        if (!companyId) return errorResponse(res, 'No valid company mapping for mission.', 400);

        const [result] = await db.query(
            `INSERT INTO missions (company_id, project_id, order_id, mission_type, destination_type, event_date, notes) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, projectId, project.order_id || null, mission_type || 'Delivery', destination_type || project.location || null, event_date || project.start_date || null, notes || project.description || null]
        );

        // Update project status
        await db.query(`UPDATE projects SET status = 'in_progress' WHERE id = ?`, [projectId]);

        const [missions] = await db.query(
            `SELECT m.*, u.name as driver_name, v.plate_number FROM missions m LEFT JOIN users u ON m.assigned_driver = u.id LEFT JOIN vehicles v ON m.vehicle_id = v.id WHERE m.id = ?`,
            [result.insertId]
        );
        return successResponse(res, missions[0] || { id: result.insertId }, 'Mission created from project.', 201);
    } catch (err) { 
        console.error('Convert from project error:', err);
        return errorResponse(res, 'Failed to create mission from project.', 500); 
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);
        
        let cs;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(`UPDATE missions SET status = ? WHERE id = ?${cs.clause}`, [status, req.params.id, ...cs.params]);
        return successResponse(res, { id: req.params.id, status }, 'Mission status updated.');
    } catch (err) { return errorResponse(res, 'Failed to update mission.', 500); }
};

exports.assignDriver = async (req, res) => {
    try {
        const { driverId, vehicleId } = req.body;
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);
        
        let cs;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(
            `UPDATE missions SET assigned_driver = ?, vehicle_id = ?, status = 'assigned' WHERE id = ?${cs.clause}`,
            [driverId, vehicleId || null, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Driver assigned.');
    } catch (err) { return errorResponse(res, 'Failed to assign driver.', 500); }
};

exports.remove = async (req, res) => {
    try {
        const role = req.user.role;
        const isHQ = (req.user.company_id == 1 || !req.user.company_id || req.companyScope == 1);
        
        let cs;
        if (role === 'super_admin' || (role === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(`DELETE FROM missions WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Mission deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete mission.', 500); }
};
