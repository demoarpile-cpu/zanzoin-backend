require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');
const runMigrations = require('./migrations/run');

const app = express();
const PORT = process.env.PORT || 5000;

// ========================
// MIDDLEWARE
// ========================
app.use(cors({
    origin: [
        "https://new-zanezion.netlify.app",
        "http://localhost:5173",
       "https://zanezion.kiaansoftware.com"
    ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========================
// ROUTES
// ========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/users', require('./routes/users'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/clients', require('./routes/customers'));       // Alias: frontend uses /api/clients
app.use('/api/orders', require('./routes/orders'));
app.use('/api/missions', require('./routes/missions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/procurement', require('./routes/procurement'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/support', require('./routes/support'));
app.use('/api/concierge', require('./routes/concierge'));
app.use('/api/saas', require('./routes/saas'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/notifications', require('./routes/notifications'));

// ========================
// HEALTH CHECK
// ========================
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'ZaneZion API is running', timestamp: new Date().toISOString() });
});

// ========================
// 404 Handler
// ========================
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// ========================
// ERROR HANDLER
// ========================
app.use(errorHandler);

// ========================
// START SERVER
// ========================
app.listen(PORT, async () => {
    console.log(`
    ╔══════════════════════════════════════════╗
    ║   ZaneZion Backend API Server            ║
    ║   Running on port: ${PORT}                  ║
    ║   Environment: ${process.env.NODE_ENV || 'development'}            ║
    ╚══════════════════════════════════════════╝
    `);
    // Run pending database migrations
    console.log('📦 Checking database migrations...');
    await runMigrations();
});

module.exports = app;
