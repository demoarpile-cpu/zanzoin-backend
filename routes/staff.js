const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/staffController');
const { verifyToken } = require('../middleware/auth');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

// Assignments
router.get('/assignments', ctrl.getAssignments);
router.post('/assignments', ctrl.createAssignment);
router.put('/assignments/:id', ctrl.updateAssignment);

// Clock In/Out
router.post('/clock-in', ctrl.clockIn);
router.post('/clock-out', ctrl.clockOut);

// Availability
router.put('/:userId', ctrl.toggleAvailability);

// Leave
router.get('/leave', ctrl.getLeaveRequests);
router.post('/leave', ctrl.createLeaveRequest);
router.put('/leave/:id', ctrl.updateLeaveRequest);

module.exports = router;
