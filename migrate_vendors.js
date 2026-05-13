const pool = require('./config/db');

async function run() {
    try {
        console.log('Adding created_by column to vendors table...');
        await pool.query('ALTER TABLE vendors ADD COLUMN created_by INT DEFAULT NULL AFTER company_id');
        await pool.query('ALTER TABLE vendors ADD CONSTRAINT fk_vendors_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL');
        console.log('Success: vendors table updated.');

    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
