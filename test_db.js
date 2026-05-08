const db = require('./config/db');

async function test() {
    try {
        const [result] = await db.query(
            `INSERT INTO leave_requests (company_id, user_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?, ?)`,
            [null, 1, 'sick', '2026-05-08T18:30:00.000Z', '2026-05-09T18:30:00.000Z', 'test reason']
        );
        console.log("Success:", result);
    } catch (err) {
        console.error("DB Error:", err.message);
    }
    process.exit();
}
test();
