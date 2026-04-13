const pool = require('./config/db');

async function run() {
    try {
        console.log('DESCRIBE projects:');
        const [projectsSchema] = await pool.query('DESCRIBE projects');
        console.table(projectsSchema);
        
        console.log('\nDESCRIBE orders:');
        const [ordersSchema] = await pool.query('DESCRIBE orders');
        console.table(ordersSchema);
        
    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
