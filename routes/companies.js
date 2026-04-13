const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/companyController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(verifyToken);
router.use(requireRole('super_admin'));

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
