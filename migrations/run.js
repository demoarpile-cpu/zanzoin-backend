/**
 * Auto-Migration Runner
 * Runs all pending migrations on server startup.
 * Each migration runs only once — safe to re-run.
 */
const db = require('../config/db');

// Helper: add column if it doesn't exist
async function addColumnIfMissing(table, column, definition, after = null) {
    const [cols] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    if (cols.length === 0) {
        const afterClause = after ? ` AFTER ${after}` : '';
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}${afterClause}`);
        console.log(`  ✅ Added "${column}" to ${table}`);
    }
}

const migrations = [
    {
        name: '001_add_missing_columns_to_companies',
        up: async () => {
            await addColumnIfMissing('companies', 'contact', 'VARCHAR(255)', 'contact_person');
            await addColumnIfMissing('companies', 'address', 'TEXT', 'contact');
            await addColumnIfMissing('companies', 'business_name', 'VARCHAR(255)', 'address');
        }
    },
    {
        name: '002_add_all_missing_columns_to_companies',
        up: async () => {
            // Ensure ALL columns that the update whitelist allows exist in companies table
            await addColumnIfMissing('companies', 'location', 'VARCHAR(255)', 'phone');
            await addColumnIfMissing('companies', 'logo_url', 'VARCHAR(500)', 'location');
            await addColumnIfMissing('companies', 'tagline', 'VARCHAR(500)', 'logo_url');
            await addColumnIfMissing('companies', 'plan', "VARCHAR(100) DEFAULT 'Essentials'", 'tagline');
            await addColumnIfMissing('companies', 'billing_cycle', "ENUM('Monthly','Quarterly','Annually') DEFAULT 'Monthly'", 'plan');
            await addColumnIfMissing('companies', 'payment_method', 'VARCHAR(100)', 'billing_cycle');
            await addColumnIfMissing('companies', 'contact_person', 'VARCHAR(255)', 'payment_method');
            await addColumnIfMissing('companies', 'source', 'VARCHAR(100)', 'business_name');
        }
    },
    {
        name: '003_add_project_id_to_missions',
        up: async () => {
            await addColumnIfMissing('missions', 'project_id', 'INT', 'order_id');
            // Ensure foreign key exists
            try {
                await db.query('ALTER TABLE missions ADD CONSTRAINT fk_mission_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL');
            } catch (e) {
                // If it fails (usually because it already exists), just log it
                console.log('  🕒 Note: Fails to add missions.project_id foreign key (might already exist)');
            }
        }
    },
    {
        name: '004_update_order_status_enums',
        up: async () => {
            await db.query(`
                ALTER TABLE orders 
                MODIFY COLUMN status ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','cancelled','in_progress') DEFAULT 'created',
                MODIFY COLUMN current_stage ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','in_progress') DEFAULT 'created'
            `);
            console.log('  ✅ Updated "orders" status/stage enums');
        }
    }
];

async function runMigrations() {
    try {
        // Create migrations tracking table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                ran_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [completed] = await db.query('SELECT name FROM _migrations');
        const completedNames = new Set(completed.map(r => r.name));

        let count = 0;
        for (const migration of migrations) {
            if (completedNames.has(migration.name)) continue;
            console.log(`  ⏳ Running migration: ${migration.name}`);
            await migration.up();
            await db.query('INSERT INTO _migrations (name) VALUES (?)', [migration.name]);
            console.log(`  ✅ Completed: ${migration.name}`);
            count++;
        }

        if (count === 0) {
            console.log('  ✅ All migrations already applied');
        } else {
            console.log(`  ✅ ${count} migration(s) applied successfully`);
        }
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        // Don't crash the server — just log the error
    }
}

module.exports = runMigrations;
