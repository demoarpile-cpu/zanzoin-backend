# ZaneZion — Roles, Rules & Access Control

---

## 1. Role Definitions

### 1.1 Super Admin (`superadmin`)
- **Who**: Platform owner / ZaneZion HQ
- **Access**: Full access to everything
- **Key Actions**:
  - Manage SaaS plans (create, edit, delete)
  - Review & provision SaaS clients
  - Manage all client companies
  - Access all data across all companies
  - No `company_id` filter — sees everything

### 1.2 Client (`client`)
- **Who**: Business owner who has been provisioned as a client company
- **Access**: Full access to their own company's data
- **Key Actions**:
  - Manage their staff (users, payroll, assignments)
  - Manage orders, projects, missions, deliveries
  - Manage inventory, invoices
  - Access reports, support dashboard
  - View/edit company settings & branding
- **Data Scope**: Filtered by own `company_id` (which is `clients.id`)

### 1.3 SaaS Client (`saas_client`)
- **Who**: External customer who subscribed via landing page
- **Access**: Limited portal — own orders, events, chauffeur, support
- **Key Actions**:
  - Place orders, view order history
  - Book chauffeur services, events
  - View invoices, track deliveries
  - Submit support tickets
  - Manage own settings
- **Data Scope**: Filtered by own `company_id`

### 1.4 Operations (`operations`)
- **Who**: Operations manager / team lead
- **Access**: Projects, orders, missions, deliveries, invoices, staff terminal
- **Key Actions**:
  - Manage projects and their lifecycle
  - Handle orders (approve, dispatch)
  - Create/track missions
  - Manage deliveries
  - View invoices (not create)
  - Access staff terminal, leave management, pay records

### 1.5 Procurement (`procurement`)
- **Who**: Procurement/purchasing officer
- **Access**: Vendors, purchase requests, quotes, purchase orders, invoices, audits
- **Key Actions**:
  - Manage vendors (add, update, rate)
  - Handle purchase requests
  - Get/manage vendor quotes
  - Issue purchase orders
  - Receive goods against POs
  - View invoices
  - Access audit logs

### 1.6 Logistics (`logistics`)
- **Who**: Fleet/dispatch manager
- **Access**: Missions, deliveries, fleet, routes, tracking, urgent tasks
- **Key Actions**:
  - View and manage active missions
  - Manage deliveries (dispatch, update status)
  - Manage fleet (vehicles CRUD)
  - Define routes
  - Track live deliveries
  - Handle urgent logistics tasks
  - Access staff terminal

### 1.7 Inventory (`inventory`)
- **Who**: Warehouse/stock controller
- **Access**: Inventory, warehouses, alerts, audits, staff terminal
- **Key Actions**:
  - Full inventory CRUD
  - Stock adjustments (entry, issue, loss)
  - Manage warehouses
  - Monitor low stock alerts
  - Run inventory audits

### 1.8 Concierge (`concierge`)
- **Who**: Guest services / luxury concierge officer
- **Access**: Events, guest requests, luxury items, inventory (view), chauffeur, VIP access plans
- **Key Actions**:
  - Manage events
  - Handle VIP guest requests
  - Manage luxury item vault
  - View inventory (for guest amenities)
  - Manage chauffeur protocol
  - Manage access plans

### 1.9 Staff (`staff`)
- **Who**: Field staff / hourly worker
- **Access**: Staff terminal only (assignments, clock in/out, leave, pay)
- **Key Actions**:
  - View assigned tasks
  - Clock in/out
  - Request leave
  - View pay records
  - Toggle availability

---

## 2. Authentication Rules

### Login Rules
1. User must provide valid `email` + `password`
2. Password is compared using bcrypt
3. On success: JWT token generated with `{ id, email, role, company_id }`
4. Token expires in 7 days
5. Frontend stores: `token`, `userRole`, `userEmail`, `user` (JSON) in localStorage

### Token Validation
1. Every protected route checks `Authorization: Bearer <token>` header
2. Invalid/expired token → 401 Unauthorized
3. Missing token → 401 Unauthorized
4. Valid token → decode payload → attach to `req.user`

### Password Reset Rules
1. OTP is 6 digits, expires in 15 minutes
2. OTP sent via email (Nodemailer)
3. OTP verified before allowing password change
4. New password must be hashed before storing

### Staff Registration Rules
1. Self-registration creates user with `status: 'pending'`
2. Pending staff cannot login
3. Admin reviews → changes status to `active` or `rejected`
4. Only `active` users can login
5. Document uploads stored in `/uploads/` directory

---

## 3. Data Scoping Rules (Multi-Tenancy)

### Rule 1: Company Isolation
- Every data query (except superadmin) MUST filter by `company_id`
- `company_id` comes from `req.user.company_id` (decoded from JWT)
- superadmin queries have NO company_id filter

### Rule 2: How company_id works
```
Super Admin → company_id = NULL → Sees all data
Client      → company_id = clients.id → Sees only their company data
Staff roles → company_id = their employer's clients.id → Sees only their company data
SaaS Client → company_id = their clients.id → Sees only their data
```

### Rule 3: Insert operations
- When creating any record, automatically set `company_id = req.user.company_id`
- Superadmin can optionally specify a `company_id`

---

## 4. Role-Based Middleware Rules

### Implementation Pattern:
```javascript
// middleware/role.js
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    // superadmin always passes
    if (req.user.role === 'super_admin') return next();
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};
```

### Route Protection Map:

| Route Group      | Allowed Roles                                                      |
| ---------------- | ------------------------------------------------------------------ |
| `/auth/*`        | Public (no auth required for login/register/forgot/reset)          |
| `/dashboard/*`   | All authenticated users                                            |
| `/clients/*`     | superadmin, client, operations (view only)                         |
| `/orders/*`      | superadmin, client, saas_client, operations, procurement (view)    |
| `/missions/*`    | superadmin, client, operations, logistics                          |
| `/vendors/*`     | superadmin, procurement                                            |
| `/inventory/*`   | superadmin, client, inventory, concierge (view)                    |
| `/warehouses/*`  | superadmin, inventory                                              |
| `/procurement/*` | superadmin, client, procurement                                    |
| `/logistics/*`   | superadmin, logistics                                              |
| `/finance/*`     | superadmin, client, saas_client (own invoices), operations (view)  |
| `/staff/*`       | superadmin, client, all staff roles (own data)                     |
| `/support/*`     | superadmin, client, concierge, saas_client (tickets only)          |
| `/concierge/*`   | superadmin, concierge                                              |
| `/saas/*`        | superadmin (most), public (submit only)                            |
| `/settings/*`    | All authenticated users (own company settings)                     |

---

## 5. Business Logic Rules

### Order Rules
- Order total is auto-calculated from `items` JSON: `SUM(qty * price)`
- Status transitions: pending_review → approved → in_progress → dispatched → delivered → completed
- Cannot delete a completed order
- Order conversion (to project or mission) changes order status to `in_progress`

### Invoice Rules
- Auto-generated when delivery status changes to `delivered`
- Invoice amount = order total_amount
- Partial payments allowed (paid_amount tracked separately)
- Status auto-updates: unpaid → partial (if paid < total) → paid (if paid >= total)
- Overdue check: if `due_date < today AND status != 'paid'` → mark as overdue

### Inventory Rules
- Entry: increases quantity
- Issue: decreases quantity (cannot go below 0)
- Loss: decreases quantity with mandatory reason
- Auto-status: qty > threshold → in_stock, qty <= threshold AND qty > 0 → low_stock, qty = 0 → out_of_stock
- Each adjustment creates an `inventory_movements` record

### Staff Rules
- Only one active shift at a time per user
- Clock out auto-calculates duration_hours
- Leave balance based on employment type and tenure (see vacation balance formula)
- Pending staff cannot clock in or receive assignments

### Procurement Rules
- Purchase Request → requires approval before PO
- PO items track ordered_qty and received_qty separately
- Partial receiving: updates individual item received_qty
- When all items fully received → PO status = Received
- Goods receiving should update corresponding inventory quantities

### SaaS Provisioning Rules
- Provision creates: 1 client record + 1 user record (role: client)
- Auto-generates password (random 12-char)
- Email credentials to the new client
- Sets client status to 'active'

---

## 6. Vacation Balance Formula

```
Salaried Employees:
- < 6 months tenure  → 0 days
- 6 months to 1 year → 5 days (1 week)
- 1 to 10 years      → 10 days (2 weeks)
- > 10 years          → 15 days (3 weeks)

Hourly Employees:
- < 1 year tenure  → 0 days
- >= 1 year tenure → 10 days (2 weeks)
```
