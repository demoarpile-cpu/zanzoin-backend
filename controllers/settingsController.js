const db = require('../config/db');
const { companyFilter } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

exports.getSettings = async (req, res) => {
    try {
        const cf = companyFilter(req);
        const [rows] = await db.query(`SELECT * FROM system_settings WHERE 1=1 ${cf.clause}`, cf.params);
        // Convert to key-value object
        const settings = {};
        rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
        return successResponse(res, settings);
    } catch (err) { return errorResponse(res, 'Failed to fetch settings.', 500); }
};

exports.updateSettings = async (req, res) => {
    try {
        const companyId = req.companyScope;
        const entries = Object.entries(req.body);

        for (const [key, value] of entries) {
            await db.query(
                `INSERT INTO system_settings (company_id, setting_key, setting_value) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = ?`,
                [companyId, key, value, value]
            );
        }
        return successResponse(res, null, 'Settings updated.');
    } catch (err) { return errorResponse(res, 'Failed to update settings.', 500); }
};
