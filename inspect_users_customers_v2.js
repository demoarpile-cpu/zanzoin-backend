const pool = require('./config/db');

async function run() {
    try {
        const [users] = await pool.query('SHOW COLUMNS FROM users');
        console.log('Users columns:', users.map(c => c.Field).join(', '));
        
        const [customers] = await pool.query('SHOW COLUMNS FROM customers');
        console.log('Customers columns:', customers.map(c => c.Field).join(', '));
        
    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
