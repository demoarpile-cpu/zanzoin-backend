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

async function resolveValidCompanyId(candidateId) {
    const normalized = normalizePositiveInt(candidateId);
    if (!normalized) return null;
    const [rows] = await db.query('SELECT id FROM companies WHERE id = ? LIMIT 1', [normalized]);
    return rows.length ? normalized : null;
}

// --- VEHICLES ---
exports.getVehicles = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);

        let cf;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req);
        }
        const [rows] = await db.query(`SELECT * FROM vehicles WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch vehicles.', 500); }
};

exports.createVehicle = async (req, res) => {
    try {
        const { plate_number, model, type, vehicle_type, capacity, fuel_level, insurance_policy, registration_expiry, inspection_date, diagnostic_status } = req.body;
        let companyId = await resolveValidCompanyId(req.companyScope);
        const [result] = await db.query(
            `INSERT INTO vehicles (company_id, plate_number, model, type, vehicle_type, capacity, fuel_level, insurance_policy, registration_expiry, inspection_date, diagnostic_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, plate_number, model || null, type || null, vehicle_type || 'Car', capacity || null, fuel_level || 100, insurance_policy || null, registration_expiry || null, inspection_date || null, diagnostic_status || null]
        );
        return successResponse(res, { id: result.insertId }, 'Vehicle added.', 201);
    } catch (err) { return errorResponse(res, 'Failed to add vehicle.', 500); }
};

exports.updateVehicle = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['id', 'created_at', 'company_id'].includes(k)) continue;
            sets.push(`${k} = ?`); values.push(v);
        }

        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);

        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Vehicle updated.');
    } catch (err) { return errorResponse(res, 'Failed to update vehicle.', 500); }
};

exports.deleteVehicle = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);

        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(`DELETE FROM vehicles WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Vehicle deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete vehicle.', 500); }
};

// --- DELIVERIES ---
exports.getDeliveries = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().trim().replace(/\s+/g, '_');
        if (roleNorm === 'super_admin' || roleNorm === 'superadmin') {
            const [rows] = await db.query(
                `SELECT d.*, 
                        d.assigned_driver as driverId,
                        d.vehicle_id as vehicleId,
                        v.plate_number as vehicle_plate,
                        u.name as driver_name,
                        u.profile_pic_url as driver_profile_url,
                        o.delivery_instructions as order_instructions,
                        o.notes as order_notes,
                        o.total_amount as order_total_amount
                 FROM deliveries d
                 LEFT JOIN vehicles v ON d.vehicle_id = v.id
                 LEFT JOIN users u ON d.assigned_driver = u.id
                 LEFT JOIN orders o ON d.order_id = o.id
                 ORDER BY d.created_at DESC`
            );
            return successResponse(res, rows);
        }

        let companyId = await resolveValidCompanyId(req.companyScope);
        if (!companyId) companyId = await resolveValidCompanyId(req.user?.company_id);
        if (!companyId) companyId = await resolveValidCompanyId(process.env.DEFAULT_COMPANY_ID || 1);
        if (!companyId) {
            const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
            if (anyCompany.length) companyId = anyCompany[0].id;
        }
        if (!companyId) return successResponse(res, []);

        // Logic for Staff isolation
        const isStaffOnly = ['staff', 'field_staff', 'driver'].includes(roleNorm);
        let query = `
            SELECT d.*, 
                   d.assigned_driver as driverId,
                   d.vehicle_id as vehicleId,
                   v.plate_number as vehicle_plate,
                   u.name as driver_name,
                   u.profile_pic_url as driver_profile_url,
                   o.delivery_instructions as order_instructions,
                   o.notes as order_notes,
                   o.total_amount as order_total_amount
            FROM deliveries d
            LEFT JOIN vehicles v ON d.vehicle_id = v.id
            LEFT JOIN users u ON d.assigned_driver = u.id
            LEFT JOIN orders o ON d.order_id = o.id
            WHERE d.company_id = ?
        `;
        let params = [companyId];

        if (isStaffOnly) {
            query += ` AND (d.assigned_driver = ? OR d.assigned_driver IS NULL)`;
            params.push(req.user.id);
        }

        query += ` ORDER BY d.created_at DESC`;

        const [rows] = await db.query(query, params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch deliveries.', 500); }
};

exports.createDelivery = async (req, res) => {
    try {
        const {
            order_id,
            route,
            driver_name,
            plate_number,
            package_details,
            status,
            mission_type,
            pickup_location,
            drop_location,
            passenger_info,
            delivery_date,
            pickup_time,
            assigned_driver,
            delivery_instructions,
            delivery_fee
        } = req.body;
        // For super_admin: resolve company_id from request body or from the order
        let companyId = await resolveValidCompanyId(req.companyScope);
        if (!companyId) companyId = await resolveValidCompanyId(req.body.company_id);
        if (!companyId && order_id) {
            const safeOid = order_id && !isNaN(Number(order_id)) ? Number(order_id) : null;
            if (safeOid) {
                const [orderRows] = await db.query('SELECT company_id FROM orders WHERE id = ?', [safeOid]);
                if (orderRows.length > 0) {
                    companyId = await resolveValidCompanyId(orderRows[0].company_id);
                }
            }
        }
        if (!companyId) companyId = await resolveValidCompanyId(req.user?.company_id);
        if (!companyId) companyId = await resolveValidCompanyId(process.env.DEFAULT_COMPANY_ID || 1);
        if (!companyId) {
            const [anyCompany] = await db.query('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
            if (anyCompany.length) companyId = anyCompany[0].id;
        }
        if (!companyId) {
            return errorResponse(res, 'No valid company mapping found for delivery.', 400);
        }

        // Sanitize order_id - must be valid integer or null (foreign key constraint)
        const rawOrderId = order_id && !isNaN(Number(order_id)) ? Number(order_id) : null;

        // Validate the order actually exists to prevent FK constraint failure
        let safeOrderId = null;
        if (rawOrderId) {
            const [orderCheck] = await db.query('SELECT id FROM orders WHERE id = ?', [rawOrderId]);
            safeOrderId = orderCheck.length > 0 ? rawOrderId : null;
        }

        // Sanitize delivery_date - must be valid date or null
        const safeDeliveryDate = delivery_date && delivery_date !== '' ? delivery_date : null;

        // Sanitize pickup_time - must be valid time or null
        const safePickupTime = pickup_time && pickup_time !== '' ? pickup_time : null;

        // Validate mission_type against ENUM constraints
        const allowedMissionTypes = ['Delivery', 'Pickup', 'Transfer', 'Chauffeur'];
        const safeMissionType = allowedMissionTypes.includes(mission_type) ? mission_type : 'Delivery';

        const feeVal =
            delivery_fee !== undefined && delivery_fee !== null && delivery_fee !== ''
                ? parseFloat(delivery_fee)
                : null;
        const instructVal =
            delivery_instructions != null && String(delivery_instructions).trim() !== ''
                ? String(delivery_instructions).trim()
                : null;

        let result;
        try {
            [result] = await db.query(
                `INSERT INTO deliveries (company_id, order_id, mission_type, route, driver_name, plate_number, package_details, pickup_location, drop_location, passenger_info, delivery_date, pickup_time, status, assigned_driver, delivery_instructions, delivery_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId,
                    safeOrderId,
                    safeMissionType,
                    route || null,
                    driver_name || null,
                    plate_number || null,
                    typeof package_details === 'string' ? package_details : JSON.stringify(package_details || []),
                    pickup_location || null,
                    drop_location || null,
                    typeof passenger_info === 'string' ? passenger_info : JSON.stringify(passenger_info || null),
                    safeDeliveryDate,
                    safePickupTime,
                    status || 'pending',
                    assigned_driver || null,
                    instructVal,
                    Number.isFinite(feeVal) ? feeVal : null
                ]
            );
        } catch (insErr) {
            if (insErr.code === 'ER_BAD_FIELD_ERROR') {
                [result] = await db.query(
                    `INSERT INTO deliveries (company_id, order_id, mission_type, route, driver_name, plate_number, package_details, pickup_location, drop_location, passenger_info, delivery_date, pickup_time, status, assigned_driver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        companyId,
                        safeOrderId,
                        safeMissionType,
                        route || null,
                        driver_name || null,
                        plate_number || null,
                        typeof package_details === 'string' ? package_details : JSON.stringify(package_details || []),
                        pickup_location || null,
                        drop_location || null,
                        typeof passenger_info === 'string' ? passenger_info : JSON.stringify(passenger_info || null),
                        safeDeliveryDate,
                        safePickupTime,
                        status || 'pending',
                        assigned_driver || null
                    ]
                );
            } else {
                throw insErr;
            }
        }

        // Notify on new delivery / chauffeur request (admin + concierge + logistics for VIP rides)
        const isChauffeur = (mission_type || '').toLowerCase() === 'chauffeur';
        const notifyRoles = isChauffeur ? ['admin', 'concierge', 'logistics', 'super_admin'] : ['logistics'];
        for (const rt of notifyRoles) {
            await createNotification({
                companyId,
                roleTarget: rt,
                type: 'delivery',
                title: isChauffeur ? 'New Chauffeur Request' : 'New Delivery Created',
                message: isChauffeur
                    ? `Chauffeur service requested — pickup: ${pickup_location || 'TBD'}`
                    : `Delivery #${result.insertId} created for Order #${safeOrderId || 'N/A'}`,
                link: isChauffeur ? '/dashboard/chauffeur' : '/dashboard/deliveries'
            });
        }

        return successResponse(res, { id: result.insertId }, 'Delivery created.', 201);
    } catch (err) {
        console.error('Create delivery error:', err);
        return errorResponse(res, `Failed to create delivery: ${err.message}`, 500);
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { status, vehicle_id, signature, driver_name, plate_number, assigned_driver, passenger_info, delivery_instructions } = req.body;
        const sets = [];
        const values = [];

        if (status) { sets.push('status = ?'); values.push(status); }
        if (vehicle_id) { sets.push('vehicle_id = ?'); values.push(vehicle_id); }
        if (signature) { sets.push('signature = ?'); values.push(signature); }
        if (driver_name !== undefined) { sets.push('driver_name = ?'); values.push(driver_name); }
        if (plate_number !== undefined) { sets.push('plate_number = ?'); values.push(plate_number); }
        if (assigned_driver !== undefined) { sets.push('assigned_driver = ?'); values.push(assigned_driver || null); }
        if (passenger_info !== undefined) {
            sets.push('passenger_info = ?');
            values.push(typeof passenger_info === 'string' ? passenger_info : JSON.stringify(passenger_info));
        }
        if (delivery_instructions !== undefined) {
            sets.push('delivery_instructions = ?');
            values.push(delivery_instructions);
        }

        if (sets.length === 0) return errorResponse(res, 'No fields to update.', 400);

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE deliveries SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);

        // Sync assignment to order if provided
        if (assigned_driver) {
            const [del] = await db.query(`SELECT order_id FROM deliveries WHERE id = ?`, [req.params.id]);
            if (del.length > 0 && del[0].order_id) {
                await db.query(`UPDATE orders SET assigned_to = ? WHERE id = ?`, [assigned_driver, del[0].order_id]);
                await db.query(`INSERT INTO order_flow_logs (order_id, stage, status, assigned_to, notes) VALUES (?, 'logistics', 'assigned', ?, 'Driver assigned to delivery mission')`, [del[0].order_id, assigned_driver]);
            }
        }

        // If delivered, update vehicle status back to available
        // If delivered, update vehicle status back to available AND sync order status AND handle payout hold
        if (status === 'delivered' || status === 'completed') {
            const [del] = await db.query(`SELECT vehicle_id, order_id, delivery_fee FROM deliveries WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
            if (del.length > 0) {
                if (del[0].vehicle_id) {
                    await db.query(`UPDATE vehicles SET status = 'available' WHERE id = ?`, [del[0].vehicle_id]);
                }
                if (del[0].order_id) {
                    await db.query(`UPDATE orders SET status = 'completed', current_stage = 'completed' WHERE id = ?`, [del[0].order_id]);
                    await db.query(`INSERT INTO order_flow_logs (order_id, stage, status, notes) VALUES (?, 'completed', 'completed', 'Delivered via Logistics Mission')`, [del[0].order_id,]);
                }
                // Initialize payout hold: 48 hours from now
                if (del[0].delivery_fee > 0) {
                    await db.query(`UPDATE deliveries SET payout_status = 'held', payout_ready_at = DATE_ADD(NOW(), INTERVAL 48 HOUR) WHERE id = ?`, [req.params.id]);
                }
            }
        }

        // If en_route, update vehicle status
        if (status === 'en_route' && vehicle_id) {
            await db.query(`UPDATE vehicles SET status = 'en_route' WHERE id = ?`, [vehicle_id]);
        }

        // Notify on delivery status changes
        const statusLabels = { 'dispatched': 'Dispatched', 'en_route': 'In Transit', 'delivered': 'Delivered', 'completed': 'Completed' };
        if (statusLabels[status]) {
            // Notify admin
            await createNotification({
                companyId: req.companyScope,
                roleTarget: 'admin',
                type: 'delivery',
                title: `Delivery #${req.params.id} — ${statusLabels[status]}`,
                message: `Delivery status updated to ${statusLabels[status]}`,
                link: '/dashboard/deliveries'
            });
            // Notify client on delivered
            if (status === 'delivered' || status === 'completed') {
                await createNotification({
                    companyId: req.companyScope,
                    roleTarget: 'customer',
                    type: 'delivery',
                    title: 'Your Order Has Been Delivered',
                    message: `Delivery #${req.params.id} has been delivered successfully`,
                    link: '/dashboard/track-delivery'
                });
            }
        }

        return successResponse(res, { id: req.params.id, status }, 'Delivery status updated.');
    } catch (err) { return errorResponse(res, 'Failed to update delivery.', 500); }
};

exports.deleteDelivery = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM deliveries WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Delivery deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete delivery.', 500); }
};

// --- ROUTES ---
exports.getRoutes = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM routes WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch routes.', 500); }
};

exports.createRoute = async (req, res) => {
    try {
        const { name, start_location, end_location, distance_km, estimated_time } = req.body;
        let companyId = await resolveValidCompanyId(req.companyScope);
        const [result] = await db.query(
            `INSERT INTO routes (company_id, name, start_location, end_location, distance_km, estimated_time) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, name, start_location || '', end_location || '', distance_km || 0, estimated_time || null]
        );
        return successResponse(res, { id: result.insertId }, 'Route created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create route.', 500); }
};

exports.updateRoute = async (req, res) => {
    try {
        const { name, start_location, end_location, distance_km, estimated_time } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE routes SET name = COALESCE(?, name), start_location = COALESCE(?, start_location), end_location = COALESCE(?, end_location), distance_km = COALESCE(?, distance_km), estimated_time = COALESCE(?, estimated_time) WHERE id = ?${cs.clause}`,
            [name, start_location, end_location, distance_km, estimated_time, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Route updated.');
    } catch (err) { return errorResponse(res, 'Failed to update route.', 500); }
};

exports.deleteRoute = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM routes WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Route deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete route.', 500); }
};

// --- PRICING ---
exports.getPricing = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM delivery_pricing WHERE 1=1 ${cf.clause}`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch pricing.', 500); }
};

exports.updatePricing = async (req, res) => {
    try {
        const { price } = req.body;
        const cs = companyScope(req);
        await db.query(`UPDATE delivery_pricing SET price = ? WHERE id = ?${cs.clause}`, [price, req.params.id, ...cs.params]);
        return successResponse(res, { id: req.params.id, price }, 'Pricing updated.');
    } catch (err) { return errorResponse(res, 'Failed to update pricing.', 500); }
};

// --- TRACKING ---
exports.getTracking = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM logistics_tracking WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch tracking.', 500); }
};

exports.createTracking = async (req, res) => {
    try {
        const { tracker_id, asset, location, signal, eta, status, delivery_id } = req.body;
        let companyId = await resolveValidCompanyId(req.companyScope);
        const [result] = await db.query(
            `INSERT INTO logistics_tracking (company_id, tracker_id, asset, location, signal_strength, eta, status, delivery_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, tracker_id || null, asset || null, location || null, signal || 'Strong', eta || null, status || 'Active', delivery_id || null]
        );
        return successResponse(res, { id: result.insertId }, 'Tracking added.', 201);
    } catch (err) { return errorResponse(res, 'Failed to add tracking.', 500); }
};

exports.updateTracking = async (req, res) => {
    try {
        const { tracker_id, asset, location, signal, eta, status, delivery_id } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE logistics_tracking SET tracker_id = COALESCE(?, tracker_id), asset = COALESCE(?, asset), location = COALESCE(?, location), signal_strength = COALESCE(?, signal_strength), eta = COALESCE(?, eta), status = COALESCE(?, status), delivery_id = COALESCE(?, delivery_id) WHERE id = ?${cs.clause}`,
            [tracker_id, asset, location, signal, eta, status, delivery_id, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Tracking updated.');
    } catch (err) { return errorResponse(res, 'Failed to update tracking.', 500); }
};

exports.deleteTracking = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM logistics_tracking WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Tracking deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete tracking.', 500); }
};

// --- URGENT ---
exports.getUrgentTasks = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM logistics_urgent_tasks WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch urgent tasks.', 500); }
};

exports.createUrgentTask = async (req, res) => {
    try {
        const { task, time, priority, location, assignee } = req.body;
        let companyId = await resolveValidCompanyId(req.companyScope);
        const [result] = await db.query(
            `INSERT INTO logistics_urgent_tasks (company_id, task, time_label, priority, location, assignee) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, task || 'Urgent Mission', time || 'Immediate', priority || 'Critical', location || null, assignee || 'Pending']
        );
        return successResponse(res, { id: result.insertId }, 'Urgent task added.', 201);
    } catch (err) { return errorResponse(res, 'Failed to add urgent task.', 500); }
};

exports.updateUrgentTask = async (req, res) => {
    try {
        const { task, time, priority, location, assignee } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE logistics_urgent_tasks SET task = COALESCE(?, task), time_label = COALESCE(?, time_label), priority = COALESCE(?, priority), location = COALESCE(?, location), assignee = COALESCE(?, assignee) WHERE id = ?${cs.clause}`,
            [task, time, priority, location, assignee, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Urgent task updated.');
    } catch (err) { return errorResponse(res, 'Failed to update urgent task.', 500); }
};

exports.deleteUrgentTask = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM logistics_urgent_tasks WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Urgent task deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete urgent task.', 500); }
};
