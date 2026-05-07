const db = require('../config/db');
async function checkAdmins() {
    try {
        const [users] = await db.query('SELECT id, name, email, company_id, role FROM users WHERE role IN ("admin", "super_admin", "superadmin")');
        console.log('Admins:', users);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkAdmins();
