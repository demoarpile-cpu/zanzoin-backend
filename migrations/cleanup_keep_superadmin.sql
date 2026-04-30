-- ============================================================
-- CLEANUP: Delete all users EXCEPT SuperAdmin
-- Run this in MySQL Workbench or terminal
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Delete all users except super_admin
DELETE FROM users WHERE role != 'super_admin';

-- Delete all companies except ZaneZion HQ (id=1)
DELETE FROM companies WHERE id != 1;

-- Clear all orders and related data
DELETE FROM order_items;
DELETE FROM order_flow_logs;
DELETE FROM orders;

-- Clear all operational data
DELETE FROM missions;
DELETE FROM deliveries;
DELETE FROM projects;
DELETE FROM inventory_movements;
DELETE FROM inventory;
DELETE FROM warehouses;
DELETE FROM vehicles;
DELETE FROM routes;
DELETE FROM invoices;
DELETE FROM payments;
DELETE FROM payroll;
DELETE FROM shifts;
DELETE FROM staff_assignments;
DELETE FROM leave_requests;
DELETE FROM purchase_requests;
DELETE FROM purchase_orders;
DELETE FROM quotes;
DELETE FROM vendors;
DELETE FROM customers;
DELETE FROM events;
DELETE FROM guest_requests;
DELETE FROM support_tickets;
DELETE FROM audit_logs;
DELETE FROM notifications;
DELETE FROM menu_permissions;

SET FOREIGN_KEY_CHECKS = 1;

-- Verify only superadmin remains
SELECT id, name, email, role, status FROM users;
SELECT id, name, tenant_type FROM companies;
