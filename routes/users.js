const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

// GET customer-role users only (for order client dropdown)
router.get('/customers', requireRole('super_admin', 'admin', 'operation', 'saas_client', 'client', 'procurement', 'inventory', 'concierge', 'logistics'), ctrl.getCustomers);

// GET all users — admin, super_admin, ops, logistics, saas_client, client can view staff
router.get('/', requireRole('super_admin', 'admin', 'operation', 'logistics', 'saas_client', 'client', 'procurement', 'inventory'), ctrl.getAll);
router.get('/:id', ctrl.getById);

// Only super_admin and tenant admins (admin role) can create/update/delete users
router.post('/', requireRole('super_admin', 'admin'), ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin'), ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin'), ctrl.remove);

// Staff review (approve/reject pending staff)
router.put('/:id/review', requireRole('super_admin', 'admin'), ctrl.review);

module.exports = router;
