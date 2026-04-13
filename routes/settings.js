const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { verifyToken } = require('../middleware/auth');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/system', ctrl.getSettings);
router.put('/system', ctrl.updateSettings);

module.exports = router;
