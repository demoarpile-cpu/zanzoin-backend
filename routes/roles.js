const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rolesController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getRoles);
router.get('/menus', ctrl.getMenus);
router.get('/:roleId/permissions', ctrl.getPermissions);
router.post('/:roleId/permissions', requireRole('super_admin', 'admin'), ctrl.savePermissions);

module.exports = router;
