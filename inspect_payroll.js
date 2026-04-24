const db = require('./config/db');

async function inspect() {
    try {
        const [cols] = await db.query('SHOW COLUMNS FROM payroll');
        console.log('\nTable: payroll');
        cols.forEach(c => console.log(`- ${c.Field} (${c.Type})${c.Null === 'NO' ? ' NOT NULL' : ''}`));
    } catch (err) {
        console.error(err.message);
    }
    process.exit(0);
}
inspect();
