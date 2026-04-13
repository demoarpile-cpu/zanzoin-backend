const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/conciergeController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/luxury-items', ctrl.getLuxuryItems);
router.post('/luxury-items', requireRole('super_admin', 'admin', 'concierge'), ctrl.createLuxuryItem);
router.put('/luxury-items/:id', requireRole('super_admin', 'admin', 'concierge'), ctrl.updateLuxuryItem);
router.delete('/luxury-items/:id', requireRole('super_admin', 'admin', 'concierge'), ctrl.deleteLuxuryItem);

module.exports = router;
