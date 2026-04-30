-- ============================================================
-- ZaneZion: Multi-Tenant Upgrade Migration
-- Run this once on existing database
-- ============================================================

-- 1. Add tenant_type to companies (distinguishes ZaneZion main vs SaaS tenants vs Business)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS tenant_type ENUM('zanezion','saas','business','personal') DEFAULT 'saas' AFTER client_type;

-- Mark ZaneZion's own company as the main tenant
UPDATE companies SET tenant_type = 'zanezion' WHERE id = 1;

-- 2. Add 'client' and 'saas_client' to users.role ENUM
--    These were missing from the original schema causing signup to fail
ALTER TABLE users
MODIFY COLUMN role ENUM(
    'super_admin','admin','manager','operation',
    'procurement','inventory','logistics','concierge',
    'staff','customer','client','saas_client'
) NOT NULL DEFAULT 'staff';

-- 3. Add delivery_address to orders (required for customer checkout)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(500) NULL AFTER location;

-- 4. Add vacation_balance to users (was missing from schema)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS vacation_balance INT DEFAULT 0 AFTER nib_number;

-- 5. Add business_license_url to users (for business signup)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS business_license_url VARCHAR(500) NULL AFTER profile_pic_url;

-- 6. Add client_name lookup to orders (for display in admin panel)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS client_name VARCHAR(255) NULL AFTER customer_id;

-- 7. Add saas_fee_paid to companies (track if SaaS signup fee was paid)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS saas_fee_paid BOOLEAN DEFAULT FALSE AFTER tenant_type;

-- 8. Update companies client_type ENUM to include 'Business' properly
ALTER TABLE companies
MODIFY COLUMN client_type ENUM('SaaS','Personal','Business') DEFAULT 'SaaS';

-- ============================================================
-- VERIFY: Check existing data is intact
-- ============================================================
SELECT
    'companies' as tbl, COUNT(*) as total FROM companies
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'orders', COUNT(*) FROM orders;
