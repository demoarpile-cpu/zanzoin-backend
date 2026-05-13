const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDisputeSystem() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log("Starting Dispute System migration...");

        // Add dispute support to support_tickets
        try {
            await db.query(`ALTER TABLE support_tickets ADD COLUMN dispute_status ENUM('none', 'pending', 'accepted', 'rejected') DEFAULT 'none' AFTER status`);
            console.log("Added dispute_status to support_tickets.");
        } catch (e) {
            if (e.message.includes("Duplicate column name")) {
                console.log("dispute_status already exists.");
            } else throw e;
        }

        try {
            await db.query(`ALTER TABLE support_tickets ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0.00 AFTER dispute_status`);
            console.log("Added refund_amount to support_tickets.");
        } catch (e) {
            if (e.message.includes("Duplicate column name")) {
                console.log("refund_amount already exists.");
            } else throw e;
        }

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration Error:", err.message);
    } finally {
        await db.end();
    }
}

migrateDisputeSystem();
