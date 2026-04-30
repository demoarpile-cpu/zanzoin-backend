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
    },
    {
        name: '005_fix_purchase_requests_columns',
        up: async () => {
            await addColumnIfMissing('purchase_requests', 'items', 'JSON', 'item_name');
            await addColumnIfMissing('purchase_requests', 'requester_id', 'INT', 'requester');
            await addColumnIfMissing('purchase_requests', 'priority', "ENUM('Low','Normal','High','Urgent') DEFAULT 'Normal'", 'requester_id');
            await addColumnIfMissing('purchase_requests', 'notes', 'TEXT', 'priority');
            await addColumnIfMissing('purchase_requests', 'estimated_cost', 'DECIMAL(12,2) DEFAULT 0.00', 'quantity');
            
            // Also ensure item_name and quantity allow NULL since we use JSON items now
            await db.query("ALTER TABLE purchase_requests MODIFY COLUMN item_name VARCHAR(255) NULL, MODIFY COLUMN quantity INT NULL");
        }
    },
    {
        name: '006_add_department_to_purchase_requests',
        up: async () => {
            await addColumnIfMissing('purchase_requests', 'department', 'VARCHAR(255)', 'notes');
        }
    },
    {
        name: '008_purchase_orders_payment_terms',
        up: async () => {
            await addColumnIfMissing('purchase_orders', 'payment_terms', "VARCHAR(255) DEFAULT 'Net 30'", 'notes');
            // Also ensure orders.status ENUM includes 'delivered'
            try {
                await db.query(`
                    ALTER TABLE orders
                    MODIFY COLUMN status ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','cancelled','in_progress','delivered') DEFAULT 'created'
                `);
                console.log('  ✅ Added delivered to orders.status enum');
            } catch (e) {
                console.log('  🕒 orders.status enum update skipped:', e.message);
            }
            console.log('  ✅ Added payment_terms to purchase_orders');
        }
    },
    {
        name: '007_multi_tenant_upgrade',
        up: async () => {
            // Add tenant_type to companies
            await addColumnIfMissing('companies', 'tenant_type', "ENUM('zanezion','saas','business','personal') DEFAULT 'saas'", 'client_type');
            await addColumnIfMissing('companies', 'saas_fee_paid', 'BOOLEAN DEFAULT FALSE', 'tenant_type');

            // Mark ZaneZion main company as 'zanezion' tenant
            await db.query(`UPDATE companies SET tenant_type = 'zanezion' WHERE id = 1`);

            // Add 'client' and 'saas_client' to users.role ENUM (was missing — broke signup)
            await db.query(`
                ALTER TABLE users
                MODIFY COLUMN role ENUM(
                    'super_admin','admin','manager','operation',
                    'procurement','inventory','logistics','concierge',
                    'staff','customer','client','saas_client'
                ) NOT NULL DEFAULT 'staff'
            `);
            console.log('  ✅ Added client/saas_client to users.role ENUM');

            // delivery_address on orders (required for customer checkout)
            await addColumnIfMissing('orders', 'delivery_address', 'VARCHAR(500)', 'location');

            // vacation_balance on users
            await addColumnIfMissing('users', 'vacation_balance', 'INT DEFAULT 0', 'nib_number');

            // business_license_url on users
            await addColumnIfMissing('users', 'business_license_url', 'VARCHAR(500)', 'profile_pic_url');

            // client_name on orders (denormalized for speed)
            await addColumnIfMissing('orders', 'client_name', 'VARCHAR(255)', 'customer_id');

            // Update companies.client_type ENUM to include 'Business'
            await db.query(`
                ALTER TABLE companies
                MODIFY COLUMN client_type ENUM('SaaS','Personal','Business') DEFAULT 'SaaS'
            `);
            console.log('  ✅ Multi-tenant upgrade complete');
        }
    },
    {
        name: '009_widen_vendors_rating_delivery',
        up: async () => {
            // rating was DECIMAL(3,2) → max 9.99; frontend sends 0–100 (%).
            await db.query(`
                ALTER TABLE vendors
                MODIFY COLUMN rating DECIMAL(5,2) NOT NULL DEFAULT 0.00
            `);
            await addColumnIfMissing('vendors', 'delivery', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00', 'rating');
            console.log('  ✅ vendors.rating widened to DECIMAL(5,2); vendors.delivery column ensured');
        }
    },
    {
        name: '010_add_logistics_tracking_and_urgent',
        up: async () => {
            await db.query(`
                CREATE TABLE IF NOT EXISTS logistics_tracking (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    company_id INT NULL,
                    tracker_id VARCHAR(100) NULL,
                    asset VARCHAR(255) NULL,
                    location VARCHAR(255) NULL,
                    signal_strength VARCHAR(50) DEFAULT 'Strong',
                    eta VARCHAR(100) NULL,
                    status VARCHAR(100) DEFAULT 'Active',
                    delivery_id INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS logistics_urgent_tasks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    company_id INT NULL,
                    task VARCHAR(255) NOT NULL,
                    time_label VARCHAR(100) DEFAULT 'Immediate',
                    priority VARCHAR(50) DEFAULT 'Critical',
                    location VARCHAR(255) NULL,
                    assignee VARCHAR(255) DEFAULT 'Pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            console.log('  ✅ logistics_tracking and logistics_urgent_tasks tables ensured');
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
