const db = require('./config/db');

async function test() {
    try {
        const [tables] = await db.query('SHOW TABLES');
        const TableNames = tables.map(t => Object.values(t)[0]);
        console.log('Tables:', TableNames);

        for (const table of ['purchase_requests', 'quotes', 'purchase_orders']) {
            if (TableNames.includes(table)) {
                const [cols] = await db.query(`SHOW COLUMNS FROM ${table}`);
                console.log(`\nTable: ${table}`);
                cols.forEach(c => console.log(`- ${c.Field} (${c.Type})${c.Null === 'NO' ? ' NOT NULL' : ''}`));
            }
        }
    } catch (err) {
        console.error(err.message);
    }
    process.exit(0);
}
test();
