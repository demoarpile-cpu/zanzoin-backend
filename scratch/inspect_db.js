const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'metro.proxy.rlwy.net',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '7A-EgD23eG*D1f-G2-C-CfH-4-cf4Ed5',
        database: process.env.DB_NAME || 'railway',
        port: process.env.DB_PORT || 18885
    });

    try {
        const [schema] = await connection.query("DESCRIBE orders");
        console.log('ORDERS SCHEMA:');
        console.table(schema);
        
        const [orders] = await connection.query("SELECT * FROM orders ORDER BY id DESC LIMIT 5");
        console.log('LATEST ORDERS:');
        console.table(orders);
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

run();
