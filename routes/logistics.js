const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/logisticsController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

// Vehicles
router.get('/vehicles', ctrl.getVehicles);
router.post('/vehicles', requireRole('super_admin', 'admin', 'logistics'), ctrl.createVehicle);
router.put('/vehicles/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.updateVehicle);
router.delete('/vehicles/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.deleteVehicle);

// Deliveries
router.get('/deliveries', ctrl.getDeliveries);
router.post('/deliveries', ctrl.createDelivery);
router.patch('/deliveries/:id/status', ctrl.updateDeliveryStatus);
router.delete('/deliveries/:id', ctrl.deleteDelivery);

// Routes
router.get('/routes', ctrl.getRoutes);
router.post('/routes', requireRole('super_admin', 'admin', 'logistics'), ctrl.createRoute);
router.put('/routes/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.updateRoute);
router.delete('/routes/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.deleteRoute);

// Pricing
router.get('/pricing', ctrl.getPricing);
router.put('/pricing/:id', requireRole('super_admin', 'admin'), ctrl.updatePricing);

// Tracking
router.get('/tracking', ctrl.getTracking);
router.post('/tracking', requireRole('super_admin', 'admin', 'logistics'), ctrl.createTracking);
router.put('/tracking/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.updateTracking);
router.delete('/tracking/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.deleteTracking);

// Urgent
router.get('/urgent', ctrl.getUrgentTasks);
router.post('/urgent', requireRole('super_admin', 'admin', 'logistics'), ctrl.createUrgentTask);
router.put('/urgent/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.updateUrgentTask);
router.delete('/urgent/:id', requireRole('super_admin', 'admin', 'logistics'), ctrl.deleteUrgentTask);

module.exports = router;
