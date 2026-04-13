const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/missionController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getAll);
router.post('/convert/:orderId', requireRole('super_admin', 'admin', 'operation'), ctrl.convertFromOrder);
router.post('/convert-project/:projectId', requireRole('super_admin', 'admin', 'operation'), ctrl.convertFromProject);
router.put('/:id/status', ctrl.updateStatus);
router.post('/:id/assign', requireRole('super_admin', 'admin', 'operation', 'logistics'), ctrl.assignDriver);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.remove);

module.exports = router;
