const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const upload = require('../middleware/upload');

// Public routes
router.post('/login', authController.login);
router.post('/register', verifyToken, authController.register);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Public self-signup (Personal / Business / SaaS) — no token required
router.post('/signup', upload.single('businessLicense'), authController.publicSignup);

// Authenticated profile update
router.put('/profile', verifyToken, authController.updateProfile);

// Staff self-registration (multipart)
router.post('/staff-register', upload.fields([
    { name: 'passport', maxCount: 1 },
    { name: 'license', maxCount: 1 },
    { name: 'nib_doc', maxCount: 1 },
    { name: 'police_record', maxCount: 1 },
    { name: 'profile_pic', maxCount: 1 }
]), authController.staffRegister);

// Admin reviews staff
router.put('/staff-review/:id', verifyToken, requireRole('super_admin', 'admin'), authController.staffReview);

module.exports = router;
