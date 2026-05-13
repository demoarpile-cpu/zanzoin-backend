const db = require('../config/db');

async function init() {
    const defaults = {
        'chauffeur_base_price': '50.00',
        'delivery_base_price': '25.00',
        'pickup_charges': '10.00',
        'per_km_charges': '2.50'
    };

    try {
        for (const [key, value] of Object.entries(defaults)) {
            const [exists] = await db.query('SELECT id FROM system_settings WHERE setting_key = ?', [key]);
            if (exists.length === 0) {
                await db.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
                console.log(`Inserted default for ${key}`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

init();
