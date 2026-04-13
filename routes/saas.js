const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/saasController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

// Public endpoints (no auth needed)
router.post('/submit', ctrl.submitRequest);
router.get('/plans', ctrl.getPlans);

// Protected routes
router.use(verifyToken, scopeByCompany);
router.post('/plans', requireRole('super_admin'), ctrl.createPlan);
router.put('/plans/:id', requireRole('super_admin'), ctrl.updatePlan);
router.delete('/plans/:id', requireRole('super_admin'), ctrl.deletePlan);

// Requests
router.get('/requests', ctrl.getRequests);
router.post('/requests/:id/provision', requireRole('super_admin'), ctrl.provisionClient);
router.put('/requests/:id', requireRole('super_admin'), ctrl.updateRequest);
router.put('/requests/:id/status', requireRole('super_admin'), ctrl.updateRequestStatus);
router.delete('/requests/:id', requireRole('super_admin'), ctrl.deleteRequest);

module.exports = router;
