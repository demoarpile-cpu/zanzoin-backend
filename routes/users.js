const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', requireRole('super_admin', 'admin', 'operation', 'logistics'), ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('super_admin', 'admin'), ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.remove);

module.exports = router;
