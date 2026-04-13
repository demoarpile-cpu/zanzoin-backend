const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');
const { createNotification } = require('./notificationController');

// --- TICKETS ---
exports.getTickets = async (req, res) => {
    try {
        const cf = companyFilter(req, 'st');
        const [rows] = await db.query(`SELECT st.*, u.name as submitted_by_name FROM support_tickets st LEFT JOIN users u ON st.submitted_by = u.id WHERE 1=1 ${cf.clause} ORDER BY st.created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch tickets.', 500); }
};

exports.createTicket = async (req, res) => {
    try {
        const { subject, description, priority } = req.body;
        const companyId = req.companyScope;
        const [result] = await db.query(
            `INSERT INTO support_tickets (company_id, subject, description, priority, submitted_by) VALUES (?, ?, ?, ?, ?)`,
            [companyId, subject, description || null, priority || 'medium', req.user.id]
        );
        // Notify admin about new support ticket
        await createNotification({
            companyId,
            roleTarget: 'admin',
            type: 'alert',
            title: 'New Support Ticket',
            message: `Ticket #${result.insertId}: ${subject} — Priority: ${priority || 'medium'}`,
            link: '/dashboard/support-tickets'
        });

        return successResponse(res, { id: result.insertId }, 'Ticket created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create ticket.', 500); }
};

exports.updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const cs = companyScope(req);
        await db.query(`UPDATE support_tickets SET status = ? WHERE id = ?${cs.clause}`, [status, req.params.id, ...cs.params]);
        return successResponse(res, { id: req.params.id, status }, 'Ticket updated.');
    } catch (err) { return errorResponse(res, 'Failed to update ticket.', 500); }
};

// --- EVENTS ---
exports.getEvents = async (req, res) => {
    try {
        const cf = companyFilter(req, 'e');
        const [rows] = await db.query(
            `SELECT e.*, COALESCE(c.name, comp.name) as client_name
             FROM events e
             LEFT JOIN companies c ON e.client_id = c.id
             LEFT JOIN companies comp ON e.company_id = comp.id
             WHERE 1=1 ${cf.clause} ORDER BY e.event_date DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch events.', 500); }
};

// Map frontend status strings to valid DB ENUM values for events
const EVENT_STATUS_MAP = {
    'planning': 'planned', 'pending approval': 'planned', 'pending': 'planned',
    'planned': 'planned', 'confirmed': 'confirmed', 'in_progress': 'in_progress',
    'in progress': 'in_progress', 'completed': 'completed', 'cancelled': 'cancelled'
};
const normalizeEventStatus = (status) => EVENT_STATUS_MAP[(status || '').toLowerCase()] || 'planned';

exports.createEvent = async (req, res) => {
    try {
        const { name, event_date, location, client_id, manager_id, status, special_requests, planner_name, guest_count } = req.body;
        let companyId = req.companyScope;
        // For super_admin / admin: resolve company_id from client_id if provided
        if (!companyId && client_id) companyId = client_id;

        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        // Customer requests always go as 'planned' (pending approval)
        const finalStatus = req.user.role === 'customer' ? 'planned' : normalizeEventStatus(status);

        const [result] = await db.query(
            `INSERT INTO events (company_id, name, event_date, location, client_id, manager_id, status, image_url, special_requests, planner_name, guest_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, name, event_date || null, location || null, client_id || null, manager_id || req.user.id, finalStatus, imageUrl, special_requests || null, planner_name || null, guest_count || 0]
        );
        const [events] = await db.query(`SELECT e.*, COALESCE(c.name, comp.name) as client_name FROM events e LEFT JOIN companies c ON e.client_id = c.id LEFT JOIN companies comp ON e.company_id = comp.id WHERE e.id = ?`, [result.insertId]);
        // Notify concierge about new event
        await createNotification({
            companyId,
            roleTarget: 'concierge',
            type: 'order',
            title: 'New Concierge Event',
            message: `Event "${name}" scheduled for ${event_date || 'TBD'}`,
            link: '/dashboard/events'
        });

        return successResponse(res, events[0] || { id: result.insertId }, 'Event created.', 201);
    } catch (err) {
        console.error('Create event error:', err);
        return errorResponse(res, 'Failed to create event.', 500);
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const { name, event_date, location, client_id, status, special_requests, planner_name, guest_count } = req.body;
        const cs = companyScope(req);
        const dbStatus = status ? normalizeEventStatus(status) : undefined;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

        await db.query(
            `UPDATE events SET name = COALESCE(?, name), event_date = COALESCE(?, event_date), location = COALESCE(?, location), client_id = COALESCE(?, client_id), status = COALESCE(?, status), image_url = COALESCE(?, image_url), special_requests = COALESCE(?, special_requests), planner_name = COALESCE(?, planner_name), guest_count = COALESCE(?, guest_count) WHERE id = ?${cs.clause}`,
            [name, event_date, location, client_id, dbStatus, imageUrl, special_requests, planner_name, guest_count, req.params.id, ...cs.params]
        );
        const [evtRow] = await db.query('SELECT company_id FROM events WHERE id = ?', [req.params.id]);
        const evtCompanyId = evtRow[0]?.company_id;
        if (status) {
            await createNotification({ companyId: evtCompanyId, roleTarget: 'customer', type: 'order', title: `Event ${dbStatus}`, message: `Event #${req.params.id} "${name || ''}" is now ${dbStatus}`, link: '/dashboard/client-events' });
        }
        await createNotification({ companyId: evtCompanyId, roleTarget: 'concierge', type: 'order', title: 'Event Updated', message: `Event #${req.params.id} updated by ${req.user.name || 'Admin'}`, link: '/dashboard/events' });
        return successResponse(res, { id: req.params.id }, 'Event updated.');
    } catch (err) { return errorResponse(res, 'Failed to update event.', 500); }
};

exports.deleteEvent = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM events WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Event deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete event.', 500); }
};

// --- GUEST REQUESTS ---
exports.getGuestRequests = async (req, res) => {
    try {
        const cf = companyFilter(req, 'gr');
        const [rows] = await db.query(
            `SELECT gr.*, c.name as client_name FROM guest_requests gr LEFT JOIN companies c ON gr.client_id = c.id WHERE 1=1 ${cf.clause} ORDER BY gr.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch guest requests.', 500); }
};

// Map frontend guest request status to valid DB ENUM
const GUEST_STATUS_MAP = {
    'pending': 'pending', 'in progress': 'in_progress', 'in_progress': 'in_progress',
    'completed': 'completed', 'cancelled': 'cancelled', 'deferred': 'pending',
    'canceled': 'cancelled'
};
const normalizeGuestStatus = (s) => GUEST_STATUS_MAP[(s || '').toLowerCase()] || 'pending';

const PRIORITY_MAP = { 'low': 'low', 'medium': 'medium', 'high': 'high', 'urgent': 'urgent' };
const normalizePriority = (p) => PRIORITY_MAP[(p || '').toLowerCase()] || 'medium';

exports.createGuestRequest = async (req, res) => {
    try {
        const { client_id, guest, requested_by, request_details, delivery_time, priority, status } = req.body;
        const companyId = req.companyScope;
        const dbPriority = normalizePriority(priority);
        const dbStatus = normalizeGuestStatus(status);
        const [result] = await db.query(
            `INSERT INTO guest_requests (company_id, client_id, guest, requested_by, request_details, delivery_time, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, client_id || null, guest || null, requested_by || null, request_details || null, delivery_time || null, dbPriority, dbStatus]
        );
        await createNotification({ companyId, roleTarget: 'concierge', type: 'order', title: 'New Concierge Request', message: `"${request_details || 'Service request'}" from ${guest || 'Guest'} — ${dbPriority} priority`, link: '/dashboard/guest-requests' });
        await createNotification({ companyId, roleTarget: 'admin', type: 'order', title: 'New Concierge Request', message: `Guest request from ${guest || 'Guest'}`, link: '/dashboard/guest-requests' });
        return successResponse(res, { id: result.insertId }, 'Guest request created.', 201);
    } catch (err) { console.error('Create guest request error:', err); return errorResponse(res, 'Failed to create guest request.', 500); }
};

exports.updateGuestRequest = async (req, res) => {
    try {
        const { guest, requested_by, request_details, delivery_time, priority, status } = req.body;
        const cs = companyScope(req);
        const dbPriority = priority ? normalizePriority(priority) : undefined;
        // Customer can't change status - only admin/concierge can approve/reject
        const dbStatus = (status && req.user.role !== 'customer') ? normalizeGuestStatus(status) : undefined;
        await db.query(
            `UPDATE guest_requests SET guest = COALESCE(?, guest), requested_by = COALESCE(?, requested_by), request_details = COALESCE(?, request_details), delivery_time = COALESCE(?, delivery_time), priority = COALESCE(?, priority), status = COALESCE(?, status) WHERE id = ?${cs.clause}`,
            [guest, requested_by, request_details, delivery_time, dbPriority, dbStatus, req.params.id, ...cs.params]
        );
        if (status) {
            const [reqRow] = await db.query('SELECT company_id FROM guest_requests WHERE id = ?', [req.params.id]);
            const cId = reqRow[0]?.company_id;
            await createNotification({ companyId: cId, roleTarget: 'customer', type: 'order', title: `Concierge Request ${status}`, message: `Your request #${req.params.id} is now "${status}"`, link: '/dashboard/guest-requests' });
            await createNotification({ companyId: cId, roleTarget: 'admin', type: 'order', title: `Guest Request #${req.params.id} — ${status}`, message: `Status updated by ${req.user.name || 'Concierge'}`, link: '/dashboard/guest-requests' });
        }
        return successResponse(res, { id: req.params.id }, 'Guest request updated.');
    } catch (err) { console.error('Update guest request error:', err); return errorResponse(res, 'Failed to update guest request.', 500); }
};

exports.deleteGuestRequest = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM guest_requests WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Guest request deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete guest request.', 500); }
};

// --- CHAUFFEUR REQUESTS ---
exports.getChauffeurRequests = async (req, res) => {
    try {
        const cf = companyFilter(req, 'd');
        const [rows] = await db.query(
            `SELECT d.*, c.name as clientName FROM deliveries d LEFT JOIN companies c ON d.company_id = c.id WHERE d.mission_type = 'Chauffeur' ${cf.clause} ORDER BY d.created_at DESC`,
            cf.params
        );
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch chauffeur requests.', 500); }
};

// --- AUDITS ---
exports.getAudits = async (req, res) => {
    try {
        const cf = companyFilter(req, 'al');
        const [rows] = await db.query(`SELECT al.*, u.name as performed_by_name FROM audit_logs al LEFT JOIN users u ON al.performed_by = u.id WHERE 1=1 ${cf.clause} ORDER BY al.created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch audits.', 500); }
};

exports.createAudit = async (req, res) => {
    try {
        const { title, type, description, status } = req.body;
        const companyId = req.companyScope;
        const [result] = await db.query(
            `INSERT INTO audit_logs (company_id, title, type, description, status, performed_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [companyId, title, type || null, description || null, status || 'pending', req.user.id]
        );
        return successResponse(res, { id: result.insertId }, 'Audit created.', 201);
    } catch (err) { return errorResponse(res, 'Failed to create audit.', 500); }
};

exports.updateAudit = async (req, res) => {
    try {
        const { title, type, description, status } = req.body;
        const cs = companyScope(req);
        await db.query(
            `UPDATE audit_logs SET title = COALESCE(?, title), type = COALESCE(?, type), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?${cs.clause}`,
            [title, type, description, status, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Audit updated.');
    } catch (err) { return errorResponse(res, 'Failed to update audit.', 500); }
};

exports.deleteAudit = async (req, res) => {
    try {
        const cs = companyScope(req);
        await db.query(`DELETE FROM audit_logs WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Audit deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete audit.', 500); }
};
