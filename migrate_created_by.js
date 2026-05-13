const pool = require('./config/db');

async function run() {
    try {
        console.log('Adding created_by column to users table...');
        await pool.query('ALTER TABLE users ADD COLUMN created_by INT DEFAULT NULL AFTER company_id');
        await pool.query('ALTER TABLE users ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL');
        console.log('Success: users table updated.');

        console.log('Adding created_by column to customers table...');
        await pool.query('ALTER TABLE customers ADD COLUMN created_by INT DEFAULT NULL AFTER company_id');
        await pool.query('ALTER TABLE customers ADD CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL');
        console.log('Success: customers table updated.');

    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
