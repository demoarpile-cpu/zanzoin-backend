const db = require('../config/db');

async function migrate() {
    try {
        console.log('Starting migration: adding assigned_driver column...');
        
        await db.query(`
            ALTER TABLE deliveries 
            ADD COLUMN assigned_driver INT NULL AFTER vehicle_id,
            ADD CONSTRAINT fk_deliveries_driver FOREIGN KEY (assigned_driver) REFERENCES users(id) ON DELETE SET NULL
        `);
        
        console.log('Migration successful: assigned_driver column added.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
