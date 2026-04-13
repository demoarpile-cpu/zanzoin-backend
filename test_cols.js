const db = require('./config/db');

async function test() {
    try {
        const [rows] = await db.query('SHOW COLUMNS FROM quotes');
        console.log('Columns:');
        rows.forEach(r => console.log(`- ${r.Field}`));
    } catch (err) {
        console.error(err.message);
    }
    process.exit(0);
}
test();
