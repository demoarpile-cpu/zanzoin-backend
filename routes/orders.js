const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

// Projects (must be before /:id to avoid conflict)
router.get('/projects/all', ctrl.getAllProjects);
router.post('/projects', requireRole('super_admin', 'admin', 'operation'), ctrl.createProject);
router.put('/projects/:id', requireRole('super_admin', 'admin', 'operation'), ctrl.updateProject);
router.delete('/projects/:id', requireRole('super_admin', 'admin'), ctrl.deleteProject);

// Super Admin: orders by company
router.get('/by-company/:companyId', requireRole('super_admin'), ctrl.getByCompany);

// Order conversion
router.post('/convert/:orderId', requireRole('super_admin', 'admin', 'operation'), ctrl.convertToProject);

// Orders CRUD
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin', 'operation'), ctrl.update);
router.patch('/:id/status', requireRole('super_admin', 'admin', 'operation', 'procurement', 'inventory', 'logistics'), ctrl.updateStatus);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.remove);

// Workflow
router.put('/:id/assign', requireRole('super_admin', 'admin', 'manager', 'operation'), ctrl.assignToStage);
router.get('/:id/flow-logs', ctrl.getFlowLogs);

module.exports = router;
