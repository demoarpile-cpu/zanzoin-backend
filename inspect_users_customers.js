const pool = require('./config/db');

async function run() {
    try {
        console.log('DESCRIBE users:');
        const [usersSchema] = await pool.query('DESCRIBE users');
        console.table(usersSchema);
        
        console.log('\nDESCRIBE customers:');
        const [customersSchema] = await pool.query('DESCRIBE customers');
        console.table(customersSchema);
        
    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
