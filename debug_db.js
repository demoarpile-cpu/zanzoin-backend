const db = require('./config/db');

async function debug() {
    try {
        const [rows] = await db.query('DESCRIBE quotes');
        console.log('Quotes Table Structure:', rows);

        const [vendors] = await db.query('SELECT id, name FROM vendors LIMIT 5');
        console.log('Sample Vendors:', vendors);

        const [prs] = await db.query('SELECT id FROM purchase_requests LIMIT 5');
        console.log('Sample Purchase Requests:', prs);
    } catch (err) {
        console.error('Debug failed:', err);
    }
    process.exit(0);
}

debug();
