const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/procurementController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

// Purchase Requests
router.get('/requests', ctrl.getRequests);
router.post('/requests', ctrl.createRequest);
router.put('/requests/:id', ctrl.updateRequest);
router.delete('/requests/:id', ctrl.deleteRequest);

// Quotes
router.get('/quotes', ctrl.getQuotes);
router.post('/quotes', requireRole('super_admin', 'admin', 'procurement'), ctrl.createQuote);
router.put('/quotes/:id', requireRole('super_admin', 'admin', 'procurement'), ctrl.updateQuote);
router.delete('/quotes/:id', requireRole('super_admin', 'admin', 'procurement'), ctrl.deleteQuote);

// Purchase Orders
router.get('/po', ctrl.getPOs);
router.post('/po', requireRole('super_admin', 'admin', 'procurement'), ctrl.createPO);
router.put('/po/:id', requireRole('super_admin', 'admin', 'procurement'), ctrl.updatePO);
router.put('/po/:id/receive', requireRole('super_admin', 'admin', 'procurement', 'inventory'), ctrl.receiveGoods);

module.exports = router;
