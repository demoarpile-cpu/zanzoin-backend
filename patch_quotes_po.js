const db = require('./config/db');

async function patch() {
    try {
        console.log('Adding items column to quotes...');
        await db.query(`ALTER TABLE quotes ADD COLUMN items JSON AFTER purchase_request_id`);
        console.log('Successfully added items to quotes.');
    } catch (err) {
        console.log('Quotes table patch skipped or failed:', err.message);
    }

    try {
        console.log('Adding items column to purchase_orders...');
        await db.query(`ALTER TABLE purchase_orders ADD COLUMN items JSON AFTER vendor_id`);
        console.log('Successfully added items to purchase_orders.');
    } catch (err) {
        console.log('Purchase orders table patch skipped or failed:', err.message);
    }

    process.exit(0);
}

patch();
