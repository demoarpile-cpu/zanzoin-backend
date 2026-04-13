const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const { verifyToken } = require('../middleware/auth');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);
router.get('/stats', ctrl.getStats);

module.exports = router;
