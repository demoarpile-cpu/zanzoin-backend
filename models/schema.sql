-- ============================================
-- ZaneZion Database Schema (MySQL)
-- Multi-Tenant SaaS Architecture
-- ============================================

CREATE DATABASE IF NOT EXISTS zanezion;
USE zanezion;

-- ============================================
-- 1. COMPANIES (Tenants)
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    location VARCHAR(255),
    logo_url VARCHAR(500),
    tagline VARCHAR(500),
    plan VARCHAR(100) DEFAULT 'Essentials',
    billing_cycle ENUM('Monthly','Quarterly','Annually') DEFAULT 'Monthly',
    payment_method VARCHAR(100),
    contact_person VARCHAR(255),
    contact VARCHAR(255),
    address TEXT,
    business_name VARCHAR(255),
    client_type ENUM('SaaS','Personal') DEFAULT 'SaaS',
    source VARCHAR(100),
    created_by INT DEFAULT NULL,
    status ENUM('active','pending','suspended','rejected') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- 2. USERS (All roles)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role ENUM('super_admin','admin','manager','operation','procurement','inventory','logistics','concierge','staff','customer') NOT NULL DEFAULT 'staff',
    is_available BOOLEAN DEFAULT TRUE,
    employment_status ENUM('Full Time','Part Time','Probation','Inactive') DEFAULT 'Full Time',
    birthday DATE,
    bank_name VARCHAR(255),
    account_number VARCHAR(255),
    routing_number VARCHAR(255),
    nib_number VARCHAR(100),
    passport_url VARCHAR(500),
    license_url VARCHAR(500),
    nib_doc_url VARCHAR(500),
    police_record_url VARCHAR(500),
    profile_pic_url VARCHAR(500),
    status ENUM('pending','active','rejected','inactive') DEFAULT 'active',
    joined_date DATE DEFAULT (CURRENT_DATE),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 3. CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    contact VARCHAR(255),
    address TEXT,
    client_type ENUM('Direct','SaaS','Enterprise','Individual') DEFAULT 'Direct',
    status ENUM('active','inactive','suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ============================================
-- 4. VENDORS
-- ============================================
CREATE TABLE IF NOT EXISTS vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    contact_name VARCHAR(255),
    category VARCHAR(100),
    location VARCHAR(255),
    rating DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    delivery DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    status ENUM('active','inactive','blacklisted') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 5. ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    customer_id INT,
    vendor_id INT,
    created_by INT,
    type VARCHAR(100) DEFAULT 'Custom Order',
    items JSON,
    notes TEXT,
    location VARCHAR(255),
    total_amount DECIMAL(12,2) DEFAULT 0.00,
    status ENUM('created','admin_review','operation','procurement','inventory','logistics','completed','cancelled') DEFAULT 'created',
    current_stage ENUM('created','admin_review','operation','procurement','inventory','logistics','completed') DEFAULT 'created',
    assigned_to INT,
    order_date DATE DEFAULT (CURRENT_DATE),
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 6. ORDER ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    qty INT DEFAULT 1,
    unit_price DECIMAL(12,2) DEFAULT 0.00,
    total_price DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================
-- 7. ORDER FLOW LOGS (Workflow Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS order_flow_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    stage ENUM('created','admin_review','operation','procurement','inventory','logistics','completed') NOT NULL,
    assigned_to INT,
    assigned_by INT,
    status ENUM('pending','in_progress','completed','skipped') DEFAULT 'pending',
    notes TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 8. PROJECTS
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    order_id INT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_id INT,
    location VARCHAR(255),
    status ENUM('planned','in_progress','completed','on_hold') DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 9. MISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS missions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    order_id INT,
    mission_type ENUM('Delivery','Pickup','Transfer','Chauffeur','Custom') DEFAULT 'Delivery',
    destination_type VARCHAR(100),
    assigned_driver INT,
    vehicle_id INT,
    status ENUM('pending','assigned','en_route','completed','cancelled') DEFAULT 'pending',
    event_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_driver) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 10. WAREHOUSES
-- ============================================
CREATE TABLE IF NOT EXISTS warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    capacity INT,
    manager_id INT,
    status ENUM('active','inactive','maintenance') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 11. INVENTORY
-- ============================================
CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    category VARCHAR(100),
    quantity INT DEFAULT 0,
    price DECIMAL(12,2) DEFAULT 0.00,
    threshold INT DEFAULT 10,
    warehouse_id INT,
    vendor_id INT,
    client_id INT,
    inventory_type ENUM('Marketplace','Internal','Client') DEFAULT 'Marketplace',
    status ENUM('in_stock','low_stock','out_of_stock') DEFAULT 'in_stock',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
);

-- ============================================
-- 12. INVENTORY MOVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NOT NULL,
    type ENUM('entry','issue','loss','adjustment') NOT NULL,
    quantity INT NOT NULL,
    reference_type VARCHAR(100),
    reference_id INT,
    reason TEXT,
    performed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 13. VEHICLES (Fleet)
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(255),
    type VARCHAR(100),
    vehicle_type ENUM('Van','Truck','Boat','Plane','Car','SUV') DEFAULT 'Car',
    capacity VARCHAR(50),
    fuel_level INT DEFAULT 100,
    status ENUM('available','en_route','maintenance','decommissioned') DEFAULT 'available',
    insurance_policy VARCHAR(255),
    registration_expiry DATE,
    inspection_date DATE,
    diagnostic_status VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 14. DELIVERIES
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    order_id INT,
    mission_type ENUM('Delivery','Pickup','Transfer','Chauffeur') DEFAULT 'Delivery',
    route VARCHAR(255),
    driver_name VARCHAR(255),
    plate_number VARCHAR(50),
    vehicle_id INT,
    package_details JSON,
    pickup_location VARCHAR(255),
    drop_location VARCHAR(255),
    passenger_info JSON,
    delivery_date DATE,
    pickup_time TIME,
    signature TEXT,
    status ENUM('pending','pending_review','assigned','en_route','delivered','completed','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);

-- ============================================
-- 15. ROUTES
-- ============================================
CREATE TABLE IF NOT EXISTS routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    start_location VARCHAR(255),
    end_location VARCHAR(255),
    distance_km DECIMAL(10,2),
    estimated_time VARCHAR(100),
    type ENUM('Land','Sea','Air') DEFAULT 'Land',
    status ENUM('Active','Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 16. INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    order_id INT,
    client_id INT,
    amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0.00,
    due_date DATE,
    status ENUM('unpaid','partial','paid','overdue','cancelled') DEFAULT 'unpaid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- ============================================
-- 17. PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(100),
    transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ============================================
-- 18. PAYROLL
-- ============================================
CREATE TABLE IF NOT EXISTS payroll (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    user_id INT NOT NULL,
    payment_date DATE,
    gross_amount DECIMAL(12,2),
    deductions DECIMAL(12,2) DEFAULT 0.00,
    net_amount DECIMAL(12,2),
    status ENUM('pending','processed','paid') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 19. SHIFTS (Clock In/Out)
-- ============================================
CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    user_id INT NOT NULL,
    clock_in DATETIME NOT NULL,
    clock_out DATETIME,
    location VARCHAR(255),
    duration_hours DECIMAL(6,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 20. STAFF ASSIGNMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS staff_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    assignee_id INT NOT NULL,
    task VARCHAR(500),
    location VARCHAR(255),
    status ENUM('Pending','In Progress','Completed','Cancelled') DEFAULT 'Pending',
    priority ENUM('Low','Normal','High','Urgent') DEFAULT 'Normal',
    mission_type VARCHAR(100),
    passenger_name VARCHAR(255),
    pickup_time DATETIME,
    drop_location VARCHAR(255),
    pickup_location VARCHAR(255),
    delivery_location VARCHAR(255),
    luggage VARCHAR(255),
    goods_details TEXT,
    weight VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 21. LEAVE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    user_id INT NOT NULL,
    leave_type ENUM('vacation','sick','personal','bereavement') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    reviewed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 22. PURCHASE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity INT NOT NULL,
    estimated_cost DECIMAL(12,2),
    requester VARCHAR(255),
    requester_id INT,
    status ENUM('Pending','Approved','Rejected','Received','Cancelled') DEFAULT 'Pending',
    priority ENUM('Low','Normal','High','Critical') DEFAULT 'Normal',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 23. QUOTES
-- ============================================
CREATE TABLE IF NOT EXISTS quotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    vendor_id INT NOT NULL,
    purchase_request_id INT,
    items JSON,
    total_amount DECIMAL(12,2),
    validity_date DATE,
    status ENUM('Pending','Accepted','Rejected','Expired') DEFAULT 'Pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- ============================================
-- 24. PURCHASE ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    vendor_id INT NOT NULL,
    items JSON,
    total_amount DECIMAL(12,2),
    notes TEXT,
    status ENUM('Pending','Partially Received','Received','Cancelled') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- ============================================
-- 25. EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    name VARCHAR(255) NOT NULL,
    event_date DATE,
    location VARCHAR(255),
    client_id INT,
    manager_id INT,
    status ENUM('planned','confirmed','in_progress','completed','cancelled') DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 26. GUEST REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS guest_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    client_id INT,
    guest VARCHAR(255),
    requested_by VARCHAR(255),
    request_details TEXT,
    delivery_time DATETIME,
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 27. LUXURY ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS luxury_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    item_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    vault_location VARCHAR(255),
    estimated_value DECIMAL(15,2),
    status ENUM('Stored','In Use','Transferred','Returned') DEFAULT 'Stored',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 28. SUPPORT TICKETS
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    status ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
    submitted_by INT,
    assigned_to INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 29. AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    title VARCHAR(255),
    type VARCHAR(100),
    description TEXT,
    status ENUM('pending','in_progress','completed','flagged') DEFAULT 'pending',
    performed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- 30. SAAS PLANS
-- ============================================
CREATE TABLE IF NOT EXISTS saas_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    billing_cycle ENUM('Monthly','Quarterly','Annually') DEFAULT 'Monthly',
    features JSON,
    max_users INT DEFAULT 10,
    max_orders INT DEFAULT 100,
    status ENUM('active','inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- 31. SAAS REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS saas_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    company_name VARCHAR(255),
    plan VARCHAR(100),
    contact_person VARCHAR(255),
    country VARCHAR(100),
    status ENUM('Pending','Approved','Provisioned','Rejected') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- 32. SYSTEM SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
    UNIQUE KEY unique_setting (company_id, setting_key)
);

-- ============================================
-- 33. DELIVERY PRICING
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    tier_name VARCHAR(255),
    price DECIMAL(12,2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 34. MENU PERMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS menu_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    role VARCHAR(100) NOT NULL,
    menu_name VARCHAR(255) NOT NULL,
    can_view BOOLEAN DEFAULT TRUE,
    can_create BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- ============================================
-- 35. NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    user_id INT,
    role_target VARCHAR(50),
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 36. PASSWORD RESETS
-- ============================================
CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SEED DATA: Default Super Admin + Company
-- ============================================
-- Password: admin123 (bcrypt hashed)
INSERT INTO companies (name, email, status) VALUES ('ZaneZion HQ', 'admin@zanezion.com', 'active')
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO users (company_id, name, email, password, role, status) VALUES
(1, 'Super Admin', 'admin@zanezion.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'super_admin', 'active')
ON DUPLICATE KEY UPDATE name = name;

-- Seed demo company
INSERT INTO companies (name, email, phone, location, plan, status) VALUES
('Demo Luxury Corp', 'demo@luxurycorp.com', '+1-242-555-0001', 'Nassau, Bahamas', 'Platinum', 'active')
ON DUPLICATE KEY UPDATE name = name;

-- Seed demo users (password: 123456 for all)
INSERT INTO users (company_id, name, email, password, role, status) VALUES
(2, 'Admin User', 'admin@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'admin', 'active'),
(2, 'Operations Manager', 'operation@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'operation', 'active'),
(2, 'Procurement Officer', 'procurement@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'procurement', 'active'),
(2, 'Inventory Manager', 'inventory@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'inventory', 'active'),
(2, 'Logistics Manager', 'logistics@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'logistics', 'active'),
(2, 'Concierge Officer', 'concierge@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'concierge', 'active'),
(2, 'Staff Member', 'staff@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'staff', 'active'),
(2, 'Customer User', 'customer@demo.com', '$2a$12$clwO0n/iiUoN/0j7nxU9NeMU2d405T1r4lokLP752ZiesJzmW20Mi', 'customer', 'active')
ON DUPLICATE KEY UPDATE name = name;
