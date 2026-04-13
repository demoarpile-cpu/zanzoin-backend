const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/vendorController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);
router.get('/', ctrl.getAll);
router.post('/', requireRole('super_admin', 'admin', 'procurement'), ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin', 'procurement'), ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin', 'procurement'), ctrl.remove);

module.exports = router;
