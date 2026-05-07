const db = require('../config/db');
const { companyFilter, companyScope } = require('../middleware/company');
const { successResponse, errorResponse } = require('../utils/helpers');

exports.getLuxuryItems = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cf;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cf = { clause: '', params: [] };
        } else {
            cf = companyFilter(req);
        }
        const [rows] = await db.query(`SELECT * FROM luxury_items WHERE 1=1 ${cf.clause} ORDER BY created_at DESC`, cf.params);
        return successResponse(res, rows);
    } catch (err) { return errorResponse(res, 'Failed to fetch luxury items.', 500); }
};

exports.createLuxuryItem = async (req, res) => {
    try {
        const b = req.body;
        console.log('CREATE LUXURY ITEM - body:', JSON.stringify(b));
        console.log('CREATE LUXURY ITEM - user:', JSON.stringify({ role: req.user?.role, company_id: req.user?.company_id, companyScope: req.companyScope }));
        
        const item_name = b.item_name || b.item || b.itemName;
        const owner_name = b.owner_name || b.owner || b.ownerName;
        const vault_location = b.vault_location || b.vault || b.vaultLocation;
        const estimated_value = b.estimated_value || b.value || b.estimatedValue;
        const status = b.status || 'Stored';
        const notes = b.notes || null;
        let companyId = b.company_id || req.companyScope || req.user?.company_id;
        
        // HQ Fix
        if (companyId == 1) companyId = null;

        console.log('CREATE LUXURY ITEM - resolved values:', { companyId, item_name, owner_name, vault_location, estimated_value, status });
        
        const [result] = await db.query(
            `INSERT INTO luxury_items (company_id, item_name, owner_name, vault_location, estimated_value, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyId, item_name, owner_name || null, vault_location || null, estimated_value || null, status, notes]
        );
        return successResponse(res, { id: result.insertId, item_name }, 'Luxury item added.', 201);
    } catch (err) {
        console.error('Create luxury item error:', err);
        return errorResponse(res, `Failed to add luxury item: ${err.message}`, 500);
    }
};

exports.updateLuxuryItem = async (req, res) => {
    try {
        const { item_name, owner_name, vault_location, estimated_value, status, notes } = req.body;
        
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }

        await db.query(
            `UPDATE luxury_items SET item_name = COALESCE(?, item_name), owner_name = COALESCE(?, owner_name), vault_location = COALESCE(?, vault_location), estimated_value = COALESCE(?, estimated_value), status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?${cs.clause}`,
            [item_name, owner_name, vault_location, estimated_value, status, notes, req.params.id, ...cs.params]
        );
        return successResponse(res, { id: req.params.id }, 'Luxury item updated.');
    } catch (err) { return errorResponse(res, 'Failed to update luxury item.', 500); }
};

exports.deleteLuxuryItem = async (req, res) => {
    try {
        const roleNorm = String(req.user?.role || '').toLowerCase().replace(/\s+/g, '_');
        const isSuperAdmin = ['super_admin', 'superadmin'].includes(roleNorm);
        const isHQ = (req.user?.company_id == 1 || !req.user?.company_id || req.companyScope == 1);
        
        let cs;
        if (isSuperAdmin || (roleNorm === 'admin' && isHQ)) {
            cs = { clause: '', params: [] };
        } else {
            cs = companyScope(req);
        }
        await db.query(`DELETE FROM luxury_items WHERE id = ?${cs.clause}`, [req.params.id, ...cs.params]);
        return successResponse(res, null, 'Luxury item deleted.');
    } catch (err) { return errorResponse(res, 'Failed to delete luxury item.', 500); }
};
