const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getAll);
router.get('/alerts', ctrl.getAlerts);
router.post('/', requireRole('super_admin', 'admin', 'inventory', 'procurement'), ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin', 'inventory'), ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin', 'inventory'), ctrl.remove);
router.post('/:id/adjust', requireRole('super_admin', 'admin', 'inventory', 'procurement'), ctrl.adjust);

module.exports = router;
