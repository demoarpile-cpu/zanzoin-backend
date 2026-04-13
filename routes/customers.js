const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customerController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('super_admin', 'admin', 'operation'), ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin', 'operation'), ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.remove);

module.exports = router;
