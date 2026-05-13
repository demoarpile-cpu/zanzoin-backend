const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/helpers');

exports.getSettings = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const settings = {};
        rows.forEach(r => {
            settings[r.setting_key] = r.setting_value;
        });
        return successResponse(res, settings);
    } catch (err) {
        console.error('Get settings error:', err);
        return errorResponse(res, 'Failed to fetch settings.', 500);
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = req.body; // Expecting { key: value, ... }
        for (const [key, value] of Object.entries(settings)) {
            // Check if exists
            const [exists] = await db.query('SELECT id FROM system_settings WHERE setting_key = ?', [key]);
            if (exists.length > 0) {
                await db.query('UPDATE system_settings SET setting_value = ? WHERE setting_key = ?', [String(value), key]);
            } else {
                await db.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [key, String(value)]);
            }
        }
        return successResponse(res, null, 'Settings updated successfully.');
    } catch (err) {
        console.error('Update settings error:', err);
        return errorResponse(res, 'Failed to update settings.', 500);
    }
};
