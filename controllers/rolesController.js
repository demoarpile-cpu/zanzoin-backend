const db = require('../config/db');
const { successResponse, errorResponse } = require('../utils/helpers');
const { SYSTEM_ROLES, SYSTEM_MENUS } = require('../config/systemMenus');

// GET /api/roles
exports.getRoles = async (req, res) => {
    try {
        return successResponse(res, SYSTEM_ROLES);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch roles.', 500);
    }
};

// GET /api/roles/menus
exports.getMenus = async (req, res) => {
    try {
        return successResponse(res, SYSTEM_MENUS);
    } catch (err) {
        return errorResponse(res, 'Failed to fetch menus.', 500);
    }
};

// GET /api/roles/:roleId/permissions
exports.getPermissions = async (req, res) => {
    try {
        const role = SYSTEM_ROLES.find(r => r.id === parseInt(req.params.roleId));
        if (!role) return errorResponse(res, 'Role not found.', 404);

        const companyId = req.companyScope;
        const companyClause = companyId ? 'AND (company_id = ? OR company_id IS NULL)' : '';
        const companyParams = companyId ? [companyId] : [];

        const [existing] = await db.query(
            `SELECT * FROM menu_permissions WHERE role = ? ${companyClause}`,
            [role.name, ...companyParams]
        );

        // Build permissions list: merge DB records with all menus
        const dbPerms = {};
        existing.forEach(p => {
            dbPerms[p.menu_name] = p;
        });

        const permissions = SYSTEM_MENUS.map(menu => {
            const dbPerm = dbPerms[menu.name];
            return {
                id: menu.id,
                menu_name: menu.name,
                name: menu.name,
                path: menu.path,
                icon: menu.icon,
                can_view: dbPerm ? !!dbPerm.can_view : false,
                can_add: dbPerm ? !!dbPerm.can_create : false,
                can_edit: dbPerm ? !!dbPerm.can_edit : false,
                can_delete: dbPerm ? !!dbPerm.can_delete : false,
            };
        });

        return successResponse(res, permissions);
    } catch (err) {
        console.error('Get permissions error:', err);
        return errorResponse(res, 'Failed to fetch permissions.', 500);
    }
};

// POST /api/roles/:roleId/permissions
exports.savePermissions = async (req, res) => {
    try {
        const role = SYSTEM_ROLES.find(r => r.id === parseInt(req.params.roleId));
        if (!role) return errorResponse(res, 'Role not found.', 404);

        const { permissions } = req.body;
        if (!Array.isArray(permissions)) return errorResponse(res, 'Invalid permissions data.', 400);

        const companyId = req.companyScope || null;

        // Delete existing permissions for this role + company
        if (companyId) {
            await db.query('DELETE FROM menu_permissions WHERE role = ? AND company_id = ?', [role.name, companyId]);
        } else {
            await db.query('DELETE FROM menu_permissions WHERE role = ? AND company_id IS NULL', [role.name]);
        }

        // Insert new permissions
        for (const perm of permissions) {
            const menu = SYSTEM_MENUS.find(m => m.id === perm.menu_id);
            if (!menu) continue;

            await db.query(
                `INSERT INTO menu_permissions (company_id, role, menu_name, can_view, can_create, can_edit, can_delete)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [companyId, role.name, menu.name, !!perm.can_view, !!perm.can_add, !!perm.can_edit, !!perm.can_delete]
            );
        }

        return successResponse(res, null, 'Permissions saved successfully.');
    } catch (err) {
        console.error('Save permissions error:', err);
        return errorResponse(res, 'Failed to save permissions.', 500);
    }
};
