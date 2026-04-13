# ZaneZion Database Schema (MySQL)

## Overview

All tables use `id INT AUTO_INCREMENT PRIMARY KEY`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` unless noted otherwise.

Multi-tenancy: Most tables include `company_id` to scope data per client/business.

---

## 1. users

Core user table for all roles (superadmin, client, staff, operations, etc.)

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,                -- bcrypt hashed
    phone VARCHAR(50),
    role ENUM('super_admin','client','saas_client','operations','procurement','logistics','inventory','concierge','staff','vendor') NOT NULL DEFAULT 'staff',
    company_id INT,                                 -- FK to clients.id (which company they belong to)
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
    status ENUM('pending','active','rejected','inactive') DEFAULT 'pending',
    joined_date DATE DEFAULT (CURRENT_DATE),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 2. clients

Companies/Businesses that use the platform.

```sql
CREATE TABLE clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    location VARCHAR(255),
    client_type ENUM('Direct','SaaS','Enterprise','Individual') DEFAULT 'Direct',
    plan VARCHAR(100),                              -- Platinum, Executive, Essentials
    billing_cycle ENUM('Monthly','Quarterly','Annually') DEFAULT 'Monthly',
    payment_method VARCHAR(100),
    contact_person VARCHAR(255),
    business_name VARCHAR(255),
    tagline VARCHAR(500),
    logo_url VARCHAR(500),
    source VARCHAR(100),                            -- Landing Page, Admin Dashboard, Referral
    status ENUM('active','pending','suspended','rejected') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 3. orders

All orders in the system.

```sql
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    company_id INT,
    vendor_id INT,
    type VARCHAR(100) DEFAULT 'Custom Order',       -- Custom Order, Marketplace, Procurement
    items JSON,                                      -- [{ name, qty, price, unit_price }]
    notes TEXT,
    total_amount DECIMAL(12,2) DEFAULT 0.00,
    status ENUM('pending_review','approved','in_progress','dispatched','delivered','completed','cancelled') DEFAULT 'pending_review',
    order_date DATE DEFAULT (CURRENT_DATE),
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
);
```

---

## 4. projects

Created from orders (Order → Project conversion).

```sql
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_id INT,                                  -- FK to users.id
    company_id INT,                                  -- FK to clients.id
    location VARCHAR(255),
    status ENUM('planned','in_progress','completed','on_hold') DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 5. missions

Logistics missions created from orders (Order → Mission conversion).

```sql
CREATE TABLE missions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    mission_type ENUM('Delivery','Pickup','Transfer','Chauffeur','Custom') DEFAULT 'Delivery',
    destination_type VARCHAR(100),
    assigned_driver INT,                             -- FK to users.id
    vehicle_id INT,                                  -- FK to vehicles.id
    status ENUM('pending','assigned','en_route','completed','cancelled') DEFAULT 'pending',
    event_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_driver) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);
```

---

## 6. vendors

Supplier/partner companies.

```sql
CREATE TABLE vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    contact_name VARCHAR(255),
    category VARCHAR(100),
    location VARCHAR(255),
    rating DECIMAL(3,2) DEFAULT 0.00,
    status ENUM('active','inactive','blacklisted') DEFAULT 'active',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 7. inventory

Stock items.

```sql
CREATE TABLE inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE,
    category VARCHAR(100),
    quantity INT DEFAULT 0,
    price DECIMAL(12,2) DEFAULT 0.00,
    threshold INT DEFAULT 10,                        -- low stock alert threshold
    warehouse_id INT,
    vendor_id INT,
    client_id INT,                                   -- owner company
    inventory_type ENUM('Marketplace','Internal','Client') DEFAULT 'Marketplace',
    status ENUM('in_stock','low_stock','out_of_stock') DEFAULT 'in_stock',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 8. inventory_movements

Tracks all stock adjustments (entry, issue, loss).

```sql
CREATE TABLE inventory_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NOT NULL,
    type ENUM('entry','issue','loss','adjustment') NOT NULL,
    quantity INT NOT NULL,
    reference_type VARCHAR(100),                     -- purchase_request, project, client
    reference_id INT,
    reason TEXT,
    performed_by INT,                                -- FK to users.id
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 9. warehouses

```sql
CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    capacity INT,
    manager_id INT,
    company_id INT,
    status ENUM('active','inactive','maintenance') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 10. vehicles (Fleet)

```sql
CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(255),
    type VARCHAR(100),                               -- Luxury Sedan, Cargo Van, etc.
    vehicle_type ENUM('Van','Truck','Boat','Plane','Car','SUV') DEFAULT 'Car',
    capacity VARCHAR(50),
    fuel_level INT DEFAULT 100,
    status ENUM('available','en_route','maintenance','decommissioned') DEFAULT 'available',
    insurance_policy VARCHAR(255),
    registration_expiry DATE,
    inspection_date DATE,
    diagnostic_status VARCHAR(100),
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 11. deliveries

```sql
CREATE TABLE deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    mission_type ENUM('Delivery','Pickup','Transfer','Chauffeur') DEFAULT 'Delivery',
    route VARCHAR(255),
    driver_name VARCHAR(255),
    plate_number VARCHAR(50),
    vehicle_id INT,
    package_details JSON,                            -- [{ name, qty, price }]
    pickup_location VARCHAR(255),
    drop_location VARCHAR(255),
    passenger_info JSON,                             -- For chauffeur: { passengers, luggage, amenities }
    delivery_date DATE,
    pickup_time TIME,
    signature TEXT,                                   -- Base64 or URL of delivery confirmation signature
    status ENUM('pending','pending_review','assigned','en_route','delivered','completed','cancelled') DEFAULT 'pending',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);
```

---

## 12. routes

```sql
CREATE TABLE routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    start_location VARCHAR(255),
    end_location VARCHAR(255),
    distance_km DECIMAL(10,2),
    estimated_time VARCHAR(100),
    type ENUM('Land','Sea','Air') DEFAULT 'Land',
    status ENUM('Active','Inactive') DEFAULT 'Active',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 13. invoices

```sql
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT,
    client_id INT,
    amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0.00,
    due_date DATE,
    status ENUM('unpaid','partial','paid','overdue','cancelled') DEFAULT 'unpaid',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 14. payments

```sql
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(100),
    transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
```

---

## 15. payroll

```sql
CREATE TABLE payroll (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    payment_date DATE,
    gross_amount DECIMAL(12,2),
    deductions DECIMAL(12,2) DEFAULT 0.00,
    net_amount DECIMAL(12,2),
    status ENUM('pending','processed','paid') DEFAULT 'pending',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 16. shifts (Clock In/Out)

```sql
CREATE TABLE shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    clock_in DATETIME NOT NULL,
    clock_out DATETIME,
    location VARCHAR(255),
    duration_hours DECIMAL(6,2),
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 17. staff_assignments

```sql
CREATE TABLE staff_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignee_id INT NOT NULL,                        -- FK to users.id
    task VARCHAR(500),
    location VARCHAR(255),
    status ENUM('Pending','In Progress','Completed','Cancelled') DEFAULT 'Pending',
    priority ENUM('Low','Normal','High','Urgent') DEFAULT 'Normal',
    mission_type VARCHAR(100),                       -- Chauffeur, Delivery, Goods Transport
    passenger_name VARCHAR(255),
    pickup_time DATETIME,
    drop_location VARCHAR(255),
    pickup_location VARCHAR(255),
    delivery_location VARCHAR(255),
    luggage VARCHAR(255),
    goods_details TEXT,
    weight VARCHAR(50),
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 18. leave_requests

```sql
CREATE TABLE leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    leave_type ENUM('vacation','sick','personal','bereavement') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    reviewed_by INT,                                 -- FK to users.id (manager who approved)
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 19. purchase_requests

```sql
CREATE TABLE purchase_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    quantity INT NOT NULL,
    estimated_cost DECIMAL(12,2),
    requester VARCHAR(255),
    requester_id INT,
    status ENUM('Pending','Approved','Rejected','Received','Cancelled') DEFAULT 'Pending',
    priority ENUM('Low','Normal','High','Critical') DEFAULT 'Normal',
    notes TEXT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 20. quotes

```sql
CREATE TABLE quotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NOT NULL,
    purchase_request_id INT,
    items JSON,                                      -- [{ name, quantity, unit_price }]
    total_amount DECIMAL(12,2),
    validity_date DATE,
    status ENUM('Pending','Accepted','Rejected','Expired') DEFAULT 'Pending',
    notes TEXT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);
```

---

## 21. purchase_orders

```sql
CREATE TABLE purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NOT NULL,
    items JSON,                                      -- [{ name, category, quantity, unit_price, received_qty }]
    total_amount DECIMAL(12,2),
    notes TEXT,
    status ENUM('Pending','Partially Received','Received','Cancelled') DEFAULT 'Pending',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);
```

---

## 22. events

```sql
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    event_date DATE,
    location VARCHAR(255),
    client_id INT,
    manager_id INT,
    status ENUM('planned','confirmed','in_progress','completed','cancelled') DEFAULT 'planned',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 23. guest_requests

```sql
CREATE TABLE guest_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT,
    guest VARCHAR(255),
    requested_by VARCHAR(255),
    request_details TEXT,
    delivery_time DATETIME,
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## 24. luxury_items

```sql
CREATE TABLE luxury_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    vault_location VARCHAR(255),
    estimated_value DECIMAL(15,2),
    status ENUM('Stored','In Use','Transferred','Returned') DEFAULT 'Stored',
    notes TEXT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 25. support_tickets

```sql
CREATE TABLE support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
    status ENUM('open','in_progress','resolved','closed') DEFAULT 'open',
    submitted_by INT,
    assigned_to INT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 26. audit_logs

```sql
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    type VARCHAR(100),                               -- inventory, procurement, compliance
    description TEXT,
    status ENUM('pending','in_progress','completed','flagged') DEFAULT 'pending',
    performed_by INT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);
```

---

## 27. saas_plans

```sql
CREATE TABLE saas_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,                      -- Platinum Protocol, Executive Protocol, Essentials
    price DECIMAL(12,2) NOT NULL,
    billing_cycle ENUM('Monthly','Quarterly','Annually') DEFAULT 'Monthly',
    features JSON,                                   -- ["Feature 1", "Feature 2"]
    max_users INT DEFAULT 10,
    max_orders INT DEFAULT 100,
    status ENUM('active','inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 28. saas_requests (Subscription Requests)

```sql
CREATE TABLE saas_requests (
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
```

---

## 29. system_settings

```sql
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    company_id INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 30. delivery_pricing

```sql
CREATE TABLE delivery_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tier_name VARCHAR(255),
    price DECIMAL(12,2),
    description TEXT,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 31. menu_permissions

```sql
CREATE TABLE menu_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role VARCHAR(100) NOT NULL,
    menu_name VARCHAR(255) NOT NULL,
    can_view BOOLEAN DEFAULT TRUE,
    can_create BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    company_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 32. password_resets

```sql
CREATE TABLE password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Key Relationships Diagram

```
users ──────────┬──→ clients (company_id)
                ├──→ shifts
                ├──→ staff_assignments
                ├──→ leave_requests
                └──→ payroll

clients ────────┬──→ orders
                ├──→ projects
                ├──→ invoices
                ├──→ events
                └──→ guest_requests

orders ─────────┬──→ projects (order → project conversion)
                ├──→ missions (order → mission conversion)
                ├──→ deliveries
                └──→ invoices

vendors ────────┬──→ orders
                ├──→ purchase_orders
                ├──→ quotes
                └──→ inventory

inventory ──────┬──→ inventory_movements
                └──→ warehouses

vehicles ───────┬──→ missions
                └──→ deliveries
```
