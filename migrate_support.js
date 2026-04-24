const db = require('./config/db');

async function migrate() {
    try {
        console.log('🚀 Starting Support Tickets migration...');

        // 1. Add category column
        try {
            await db.query(`ALTER TABLE support_tickets ADD COLUMN category VARCHAR(100) DEFAULT 'General' AFTER subject`);
            console.log('Added category column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') console.log('Category column already exists.');
            else throw err;
        }

        // 2. Add messages column
        try {
            await db.query(`ALTER TABLE support_tickets ADD COLUMN messages JSON DEFAULT NULL AFTER description`);
            console.log('Added messages column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') console.log('Messages column already exists.');
            else throw err;
        }

        console.log('✅ Support Tickets migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
