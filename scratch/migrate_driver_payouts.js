const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDriverPayouts() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log("Starting Driver Payout migration...");

        // Add payout columns to deliveries
        try {
            await db.query(`ALTER TABLE deliveries ADD COLUMN payout_status ENUM('none', 'held', 'released', 'disputed', 'cancelled') DEFAULT 'none' AFTER delivery_fee`);
            console.log("Added payout_status to deliveries.");
        } catch (e) {
            if (e.message.includes("Duplicate column name")) {
                console.log("payout_status already exists.");
            } else throw e;
        }

        try {
            await db.query(`ALTER TABLE deliveries ADD COLUMN payout_ready_at TIMESTAMP NULL DEFAULT NULL AFTER payout_status`);
            console.log("Added payout_ready_at to deliveries.");
        } catch (e) {
            if (e.message.includes("Duplicate column name")) {
                console.log("payout_ready_at already exists.");
            } else throw e;
        }

        console.log("Migration completed successfully.");
    } catch (err) {
        console.error("Migration Error:", err.message);
    } finally {
        await db.end();
    }
}

migrateDriverPayouts();
