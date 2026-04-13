const pool = require('./config/db');

async function run() {
    try {
        console.log('Updating orders status and current_stage enums...');
        
        await pool.query(`
            ALTER TABLE orders 
            MODIFY COLUMN status ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','cancelled','in_progress') DEFAULT 'created',
            MODIFY COLUMN current_stage ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','in_progress') DEFAULT 'created'
        `);
        
        console.log('Successfully added in_progress to orders enums.');
    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
