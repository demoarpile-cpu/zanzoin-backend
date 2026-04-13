const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');
const { scopeByCompany } = require('../middleware/company');

router.use(verifyToken, scopeByCompany);

router.get('/', ctrl.getAll);
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/:id/read', ctrl.markRead);
router.patch('/read-all', ctrl.markAllRead);

module.exports = router;
