const db = require('./config/db');

async function migrate() {
    try {
        console.log('Adding columns to payroll table...');
        await db.query(`ALTER TABLE payroll 
            ADD COLUMN base_salary DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN bonus DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN nib_deduction DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN medical_deduction DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN pension_deduction DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN savings_deduction DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN birthday_club DECIMAL(12,2) DEFAULT 0.00,
            ADD COLUMN method VARCHAR(100) DEFAULT 'Direct Deposit'
        `);
        console.log('Success: Columns added.');
    } catch (err) {
        console.error('Error adding columns:', err.message);
    }
    process.exit(0);
}
migrate();
