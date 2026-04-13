const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/financeController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/invoices', ctrl.getInvoices);
router.post('/invoices', requireRole('super_admin', 'admin', 'operation'), ctrl.createInvoice);
router.put('/invoices/:id', requireRole('super_admin', 'admin'), ctrl.updateInvoice);
router.delete('/invoices/:id', requireRole('super_admin', 'admin'), ctrl.deleteInvoice);
router.post('/invoices/:id/pay', ctrl.payInvoice);
router.get('/my-payroll', ctrl.getMyPayroll);

module.exports = router;
