const db = require('../config/db');

async function migrate() {
    try {
        console.log('Starting migration: Adding product details to inventory...');
        
        const columns = [
            { name: 'size', type: 'VARCHAR(255)' },
            { name: 'color', type: 'VARCHAR(255)' },
            { name: 'material', type: 'VARCHAR(255)' },
            { name: 'specifications', type: 'TEXT' },
            { name: 'description', type: 'TEXT' }
        ];

        for (const col of columns) {
            try {
                await db.query(`ALTER TABLE inventory ADD COLUMN ${col.name} ${col.type} DEFAULT NULL`);
                console.log(`- Added column: ${col.name}`);
            } catch (e) {
                if (e.code === 'ER_DUP_COLUMN_NAME') {
                    console.log(`- Column ${col.name} already exists.`);
                } else {
                    throw e;
                }
            }
        }
        
        console.log('✅ Migration successful: Added size, color, material, specifications, description to inventory table.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
