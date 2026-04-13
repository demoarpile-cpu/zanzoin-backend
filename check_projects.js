const pool = require('./config/db');

async function run() {
    try {
        const [schema] = await pool.query('DESCRIBE projects');
        schema.forEach(c => {
            console.log(`${c.Field}: ${c.Type}`);
        });
    } catch (e) {
        console.log('ERR:', e.message);
    } finally {
        process.exit(0);
    }
}

run();
