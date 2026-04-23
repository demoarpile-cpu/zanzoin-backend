const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// --- ASSIGNMENTS ---
exports.getAssignments = async (req, res) => {
    try {
        const cf = companyFilter(req, 'sa');
        const role = req.user.role?.toLowerCase();
        let extra = '';
        const extraParams = [];

        // Allow 'staff' or 'field staff' to see only their assignments
        if (role === 'staff' || role === 'field staff') {
            extra = ' AND sa.assignee_id = ?';
            extraParams.push(req.user.id);
        }

        const [rows] = await db.query(
            `SELECT sa.*, u.name as assignee_name FROM staff_assignments sa LEFT JOIN users u ON sa.assignee_id = u.id WHERE 1=1 ${cf.clause} ${extra} ORDER BY sa.created_at DESC`,
            [...cf.params, ...extraParams]
        );

        const mapped = rows.map(r => ({
            ...r,
            assigneeId: r.assignee_id,
            missionType: r.mission_type,
            passengerName: r.passenger_name,
            pickupTime: r.pickup_time,
            dropLocation: r.drop_location,
            pickupLocation: r.pickup_location,
            deliveryLocation: r.delivery_location,
            goodsDetails: r.goods_details
        }));

        return successResponse(res, mapped);
    } catch (err) { 
        console.error("Get Assignments Error:", err);
        return errorResponse(res, 'Failed to fetch assignments.', 500); 
    }
};

exports.createAssignment = async (req, res) => {
    try {
        const { assigneeId, task, location, status, priority, missionType, passengerName, pickupTime, dropLocation, pickupLocation, deliveryLocation, luggage, goodsDetails, weight } = req.body;
        const companyId = req.companyScope;
        const [result] = await db.query(
            `INSERT INTO staff_assignments (company_id, assignee_id, task, location, status, priority, mission_type, passenger_name, pickup_time, drop_location, pickup_location, delivery_location, luggage, goods_details, weight)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, assigneeId, task, location || null, status || 'Pending', priority || 'Normal', missionType || null, passengerName || null, pickupTime || null, dropLocation || null, pickupLocation || null, deliveryLocation || null, luggage || null, goodsDetails || null, weight || null]
        );
        await createNotification({ companyId, userId: assigneeId, type: 'order', title: 'New Assignment', message: `You have been assigned: "${task}"`, link: '/dashboard?tab=assignments' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'Staff Assigned', message: `Task "${task}" assigned to staff`, link: '/dashboard/staff-terminal' });
        return successResponse(res, { id: result.insertId }, 'Assignment created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create assignment.', 500); }
};

exports.updateAssignment = async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], values = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['id', 'created_at', 'company_id'].includes(k)) continue;
            sets.push(`${k} = ?`); values.push(v);
        }
        const cs = companyScope(req);
        values.push(req.params.id, ...cs.params);
        await db.query(`UPDATE staff_assignments SET ${sets.join(', ')} WHERE id = ?${cs.clause}`, values);
        return successResponse(res, { id: req.params.id }, 'Assignment updated.');
    } catch (err) { return errorResponse(res, 'Failed to update assignment.', 500); }
};

// --- CLOCK IN/OUT ---
exports.clockIn = async (req, res) => {
    try {
        const { location } = req.body;
        const companyId = req.user.company_id;

        const [active] = await db.query(
            'SELECT id FROM shifts WHERE user_id = ? AND clock_out IS NULL', [req.user.id]
        );
        if (active.length > 0) return errorResponse(res, 'Already clocked in.', 400);

        const [result] = await db.query(
            `INSERT INTO shifts (company_id, user_id, clock_in, location) VALUES (?, ?, NOW(), ?)`,
            [companyId, req.user.id, location || null]
        );

        await db.query('UPDATE users SET is_available = TRUE WHERE id = ?', [req.user.id]);

        return successResponse(res, { shiftId: result.insertId }, 'Clocked in.');
    } catch (err) { return errorResponse(res, 'Clock in failed.', 500); }
};

exports.clockOut = async (req, res) => {
    try {
        const [active] = await db.query(
            'SELECT * FROM shifts WHERE user_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]
        );
        if (active.length === 0) return errorResponse(res, 'No active shift.', 400);

        const shift = active[0];
        await db.query(
            `UPDATE shifts SET clock_out = NOW(), duration_hours = TIMESTAMPDIFF(MINUTE, clock_in, NOW()) / 60 WHERE id = ?`,
            [shift.id]
        );

        await db.query('UPDATE users SET is_available = FALSE WHERE id = ?', [req.user.id]);

        const [updated] = await db.query('SELECT * FROM shifts WHERE id = ?', [shift.id]);

        return successResponse(res, updated[0], 'Clocked out.');
    } catch (err) { return errorResponse(res, 'Clock out failed.', 500); }
};

// --- AVAILABILITY ---
exports.toggleAvailability = async (req, res) => {
    try {
        const { is_available } = req.body;
        const cs = companyScope(req);
        await db.query(`UPDATE users SET is_available = ? WHERE id = ?${cs.clause}`, [is_available, req.params.userId, ...cs.params]);
        return successResponse(res, { userId: req.params.userId, is_available }, 'Availability updated.');
    } catch (err) { return errorResponse(res, 'Failed to update availability.', 500); }
};

// --- LEAVE REQUESTS ---
exports.getLeaveRequests = async (req, res) => {
    try {
        const cf = companyFilter(req, 'lr');
        const role = req.user.role?.toLowerCase();
        let extra = '';
        const extraParams = [];

        if (role === 'staff' || role === 'field staff') {
            extra = ' AND lr.user_id = ?';
            extraParams.push(req.user.id);
        }

        const [rows] = await db.query(
            `SELECT lr.*, u.name as user_name FROM leave_requests lr LEFT JOIN users u ON lr.user_id = u.id WHERE 1=1 ${cf.clause} ${extra} ORDER BY lr.created_at DESC`,
            [...cf.params, ...extraParams]
        );

        const mapped = rows.map(r => ({
            ...r,
            userId: r.user_id,
            leaveType: r.leave_type,
            startDate: r.start_date,
            endDate: r.end_date
        }));

        return successResponse(res, mapped);
    } catch (err) { 
        console.error("Get Leave Error:", err);
        return errorResponse(res, 'Failed to fetch leave requests.', 500); 
    }
};

exports.createLeaveRequest = async (req, res) => {
    try {
        const { leave_type, start_date, end_date, reason } = req.body;
        const companyId = req.user.company_id;
        const [result] = await db.query(
            `INSERT INTO leave_requests (company_id, user_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, req.user.id, leave_type, start_date, end_date, reason || null]
        );
        await createNotification({ companyId, roleTarget: 'admin', type: 'alert', title: 'Leave Request Submitted', message: `${req.user.name || 'Staff'} requested ${leave_type} leave (${start_date} to ${end_date})`, link: '/dashboard/leave' });
        return successResponse(res, { id: result.insertId }, 'Leave request submitted.', 201);
    } catch (err) { return errorResponse(res, 'Failed to submit leave request.', 500); }
};

exports.updateLeaveRequest = async (req, res) => {
    try {
        const { status } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE leave_requests SET status = ?, reviewed_by = ? WHERE id = ?${cs.clause}`,
            [status, req.user.id, req.params.id, ...cs.params]
        );
        // Notify the staff member about approval/rejection
        const [leaveRow] = await db.query('SELECT user_id, company_id FROM leave_requests WHERE id = ?', [req.params.id]);
        if (leaveRow.length > 0) {
            await createNotification({ companyId: leaveRow[0].company_id, userId: leaveRow[0].user_id, type: 'alert', title: `Leave ${status}`, message: `Your leave request has been ${status.toLowerCase()} by ${req.user.name || 'Admin'}`, link: '/dashboard?tab=leave' });
        }
        return successResponse(res, { id: req.params.id, status }, 'Leave request updated.');
    } catch (err) { return errorResponse(res, 'Failed to update leave request.', 500); }
};
