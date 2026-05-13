const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');
const upload = require('../middleware/upload');

/** Multipart fields only reach req.body after multer; JSON stays on express.json — branch by Content-Type. */
function inventoryUpload(req, res, next) {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('multipart/form-data')) {
        return upload.single('image')(req, res, next);
    }
    return next();
}

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getAll);
router.get('/alerts', ctrl.getAlerts);
router.post('/', requireRole('super_admin', 'admin', 'inventory', 'procurement', 'operations', 'concierge', 'client'), inventoryUpload, ctrl.create);
router.put('/:id', requireRole('super_admin', 'admin', 'inventory', 'operations', 'concierge', 'client'), inventoryUpload, ctrl.update);
router.delete('/:id', requireRole('super_admin', 'admin', 'inventory'), ctrl.remove);
router.get('/movements', ctrl.getMovements);
router.post('/:id/adjust', requireRole('super_admin', 'admin', 'inventory', 'procurement', 'operations', 'concierge', 'client'), ctrl.adjust);

module.exports = router;
