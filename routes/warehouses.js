const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getWarehouses);
router.post('/', requireRole('super_admin', 'admin', 'inventory'), ctrl.createWarehouse);
router.put('/:id', requireRole('super_admin', 'admin', 'inventory'), ctrl.updateWarehouse);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.deleteWarehouse);

module.exports = router;
