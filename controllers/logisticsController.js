const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// --- VEHICLES ---
exports.getVehicles = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM vehicles WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch vehicles.', 500); }
};

exports.createVehicle = async (req, res) => {
    try {
        const { plate_number, model, type, vehicle_type, capacity, fuel_level, insurance_policy, registration_expiry, inspection_date, diagnostic_status } = req.body;
        const companyId = req.companyScope;
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
        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Vehicle updated.');
    } catch (err) { return errorResponse(res, 'Failed to update vehicle.', 500); }
};

exports.deleteVehicle = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM vehicles WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Vehicle deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete vehicle.', 500); }
};

// --- DELIVERIES ---
exports.getDeliveries = async (req, res) => {
    try {
        const cf = companyFilter(req, 'd');
        const [rows] = await db.query(`SELECT d.*, v.plate_number as vehicle_plate FROM deliveries d LEFT JOIN vehicles v ON d.vehicle_id = v.id WHERE 1=1 ${cf.clause} ORDER BY d.created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch deliveries.', 500); }
};

exports.createDelivery = async (req, res) => {
    try {
        const { order_id, route, driver_name, plate_number, package_details, status, mission_type, pickup_location, drop_location, passenger_info, delivery_date, pickup_time } = req.body;
        // For super_admin: resolve company_id from request body or from the order
        let companyId = req.companyScope;
        if (!companyId && req.body.company_id) {
            companyId = req.body.company_id;
        }
        if (!companyId && order_id) {
            const safeOid = order_id && !isNaN(Number(order_id)) ? Number(order_id) : null;
            if (safeOid) {
                const [orderRows] = await db.query('SELECT company_id FROM orders WHERE id = ?', [safeOid]);
                if (orderRows.length > 0) companyId = orderRows[0].company_id;
            }
        }

        // Sanitize order_id - must be valid integer or null (foreign key constraint)
        const safeOrderId = order_id && !isNaN(Number(order_id)) ? Number(order_id) : null;

        // Sanitize delivery_date - must be valid date or null
        const safeDeliveryDate = delivery_date && delivery_date !== '' ? delivery_date : null;

        // Sanitize pickup_time - must be valid time or null
        const safePickupTime = pickup_time && pickup_time !== '' ? pickup_time : null;

        const [result] = await db.query(
            `INSERT INTO deliveries (company_id, order_id, mission_type, route, driver_name, plate_number, package_details, pickup_location, drop_location, passenger_info, delivery_date, pickup_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, safeOrderId, mission_type || 'Delivery', route || null, driver_name || null, plate_number || null, typeof package_details === 'string' ? package_details : JSON.stringify(package_details || []), pickup_location || null, drop_location || null, typeof passenger_info === 'string' ? passenger_info : JSON.stringify(passenger_info || null), safeDeliveryDate, safePickupTime, status || 'pending']
        );
        // Notify on new delivery / chauffeur request
        const isChauffeur = (mission_type || '').toLowerCase() === 'chauffeur';
        await createNotification({
            companyId,
            roleTarget: isChauffeur ? 'concierge' : 'logistics',
            type: 'delivery',
            title: isChauffeur ? 'New Chauffeur Request' : 'New Delivery Created',
            message: isChauffeur ? `Chauffeur service requested — pickup: ${pickup_location || 'TBD'}` : `Delivery #${result.insertId} created for Order #${safeOrderId || 'N/A'}`,
            link: isChauffeur ? '/dashboard/chauffeur' : '/dashboard/deliveries'
        });

        return successResponse(res, { id: result.insertId }, 'Delivery created.', 201);
    } catch (err) {
        console.error('Create delivery error:', err);
        return errorResponse(res, `Failed to create delivery: ${err.message}`, 500);
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { status, vehicle_id, signature, driver_name, plate_number } = req.body;
        const sets = ['status = ?'];
        const values = [status];

        if (vehicle_id) { sets.push('vehicle_id = ?'); values.push(vehicle_id); }
        if (signature) { sets.push('signature = ?'); values.push(signature); }
        if (driver_name) { sets.push('driver_name = ?'); values.push(driver_name); }
        if (plate_number) { sets.push('plate_number = ?'); values.push(plate_number); }

        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE deliveries SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);

        // If delivered, update vehicle status back to available
        if (status === 'delivered' || status === 'completed') {
            const [del] = await db.query(`SELECT vehicle_id FROM deliveries WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
            if (del.length > 0 && del[0].vehicle_id) {
                await db.query(`UPDATE vehicles SET status = 'available' WHERE id = ?`, [del[0].vehicle_id]);
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
        const companyId = req.companyScope;
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
