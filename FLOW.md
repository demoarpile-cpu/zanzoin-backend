# ZaneZion — Complete Data Flow & Business Process Flows

---

## 1. Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      LOGIN FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User enters email + password                                │
│       │                                                      │
│       ▼                                                      │
│  POST /api/auth/login                                        │
│       │                                                      │
│       ▼                                                      │
│  Backend: Find user by email                                 │
│       │                                                      │
│       ├── Not found → 401 "Invalid credentials"              │
│       │                                                      │
│       ▼                                                      │
│  Backend: bcrypt.compare(password, user.password)            │
│       │                                                      │
│       ├── Mismatch → 401 "Invalid credentials"               │
│       │                                                      │
│       ▼                                                      │
│  Backend: Check user.status === 'active'                     │
│       │                                                      │
│       ├── Pending → 403 "Account pending approval"           │
│       ├── Rejected → 403 "Account has been rejected"         │
│       │                                                      │
│       ▼                                                      │
│  Generate JWT: { id, email, role, company_id }               │
│       │                                                      │
│       ▼                                                      │
│  Fetch menuPermissions for user's role + company             │
│       │                                                      │
│       ▼                                                      │
│  Return: { token, user, menuPermissions }                    │
│       │                                                      │
│       ▼                                                      │
│  Frontend: Store in localStorage → Navigate to /dashboard    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Staff Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  STAFF SELF-REGISTRATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Personal Info (name, email, phone, password)        │
│  Step 2: Employment (status, birthday, bank details, NIB)    │
│  Step 3: Documents (passport, license, NIB doc, police,      │
│          profile photo)                                      │
│       │                                                      │
│       ▼                                                      │
│  POST /api/auth/staff-register (multipart/form-data)         │
│       │                                                      │
│       ▼                                                      │
│  Backend: Validate fields                                    │
│  Backend: Hash password (bcrypt, 12 rounds)                  │
│  Backend: Upload files to /uploads/ via Multer               │
│  Backend: INSERT into users (status: 'pending')              │
│       │                                                      │
│       ▼                                                      │
│  Response: "Application submitted for audit"                 │
│       │                                                      │
│       ▼                                                      │
│  Admin sees in Staff Audits page                             │
│  Admin clicks Approve/Reject                                 │
│       │                                                      │
│       ▼                                                      │
│  PUT /api/auth/staff-review/:id { status: 'Active' }         │
│       │                                                      │
│       ▼                                                      │
│  Staff can now login                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Password Reset Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   PASSWORD RESET FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User clicks "Forgot Password?"                              │
│       │                                                      │
│       ▼                                                      │
│  POST /api/auth/forgot-password { email }                    │
│       │                                                      │
│       ▼                                                      │
│  Backend: Generate 6-digit OTP                               │
│  Backend: Store OTP in password_resets (expires: 15 min)     │
│  Backend: Send OTP via email (Nodemailer)                    │
│       │                                                      │
│       ▼                                                      │
│  Response: { success: true, data: { otp } }                  │
│  (OTP returned in response ONLY for dev/testing)             │
│       │                                                      │
│       ▼                                                      │
│  User enters OTP on frontend                                 │
│  Frontend validates OTP locally                              │
│       │                                                      │
│       ▼                                                      │
│  POST /api/auth/reset-password { email, otp, newPassword }   │
│       │                                                      │
│       ▼                                                      │
│  Backend: Verify OTP from password_resets table              │
│  Backend: Hash new password                                  │
│  Backend: UPDATE users SET password = hashed                 │
│  Backend: Mark OTP as used                                   │
│       │                                                      │
│       ▼                                                      │
│  "Password reset successful"                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Order → Delivery → Invoice Flow (Core Business)

```
┌─────────────────────────────────────────────────────────────┐
│              ORDER → DELIVERY → INVOICE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client/SaaS submits order                                   │
│  POST /api/orders { client_id, items, type, notes }          │
│       │                                                      │
│       ▼                                                      │
│  Order created (status: pending_review)                      │
│  total_amount = SUM(items[].qty * items[].price)             │
│       │                                                      │
│       ▼                                                      │
│  Admin/Operations reviews order                              │
│  PATCH /api/orders/:id/status { status: 'approved' }         │
│       │                                                      │
│       ▼                                                      │
│  Operations creates delivery                                 │
│  POST /api/logistics/deliveries {                            │
│    order_id, route, driver_name, plate_number,               │
│    package_details (JSON), status: 'pending'                 │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Logistics dispatches vehicle                                │
│  PATCH /api/logistics/deliveries/:id/status {                │
│    status: 'en_route', vehicle_id                            │
│  }                                                           │
│  → Vehicle status changes to 'en_route'                      │
│       │                                                      │
│       ▼                                                      │
│  Driver completes delivery                                   │
│  Client confirms with signature                              │
│  PATCH /api/logistics/deliveries/:id/status {                │
│    status: 'delivered', signature: base64                     │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Auto-trigger: Generate Invoice                              │
│  POST /api/finance/invoices {                                │
│    order_id, client_id, amount: order.total, due_date        │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Client pays invoice                                         │
│  POST /api/finance/invoices/:id/pay {                        │
│    amount, payment_method, transaction_id                    │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Invoice status: unpaid → paid                               │
│  Order status: completed                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Order → Project Conversion Flow

```
┌─────────────────────────────────────────────────────────────┐
│              ORDER → PROJECT CONVERSION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Admin selects order → clicks "Convert to Project"           │
│       │                                                      │
│       ▼                                                      │
│  POST /api/orders/convert/:orderId {                         │
│    name, description, manager_id, startDate,                 │
│    location, status, company_id                              │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Backend:                                                    │
│  1. INSERT into projects (order_id = orderId)                │
│  2. UPDATE orders SET status = 'in_progress'                 │
│       │                                                      │
│       ▼                                                      │
│  Response: Project with JOINed client_name                   │
│       │                                                      │
│       ▼                                                      │
│  Frontend auto-creates delivery entry (UI-only for now)      │
│  Operations manages project lifecycle                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Order → Mission Conversion Flow

```
┌─────────────────────────────────────────────────────────────┐
│              ORDER → MISSION CONVERSION                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Operations selects order → "Launch Mission"                 │
│       │                                                      │
│       ▼                                                      │
│  POST /api/missions/convert/:orderId {                       │
│    mission_type, destination_type, event_date, notes         │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Backend:                                                    │
│  1. INSERT into missions (order_id = orderId)                │
│  2. UPDATE orders SET status = 'in_progress'                 │
│       │                                                      │
│       ▼                                                      │
│  Logistics assigns driver + vehicle                          │
│  POST /api/missions/:id/assign { driverId, vehicleId }      │
│       │                                                      │
│       ▼                                                      │
│  Mission status: pending → assigned → en_route → completed   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Procurement Cycle Flow

```
┌─────────────────────────────────────────────────────────────┐
│              PROCUREMENT CYCLE                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Purchase Request (PR)                                    │
│     POST /api/procurement/requests                           │
│     { item_name, category, quantity, estimated_cost,         │
│       requester, priority }                                  │
│     Status: Pending                                          │
│       │                                                      │
│       ▼                                                      │
│  2. Get Vendor Quotes                                        │
│     POST /api/procurement/quotes                             │
│     { vendor_id, items, total_amount, validity_date }        │
│     Compare quotes from multiple vendors                     │
│       │                                                      │
│       ▼                                                      │
│  3. Create Purchase Order (PO)                               │
│     POST /api/procurement/po                                 │
│     { vendorId, items: [{ name, category, quantity,          │
│       unit_price }], total_amount, notes }                   │
│     Status: Pending                                          │
│       │                                                      │
│       ▼                                                      │
│  4. Receive Goods                                            │
│     PUT /api/procurement/po/:id/receive                      │
│     [{ id: itemId, receivedQty: 50 }]                        │
│       │                                                      │
│       ├── Partial → PO status: Partially Received            │
│       └── Full    → PO status: Received                      │
│       │                                                      │
│       ▼                                                      │
│  5. Inventory Auto-Update                                    │
│     inventory quantity increased by received amount           │
│     inventory_movements record created                       │
│     PR status: Received                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. SaaS Client Onboarding Flow

```
┌─────────────────────────────────────────────────────────────┐
│              SaaS ONBOARDING                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Visitor fills form on Landing Page                       │
│     POST /api/saas/submit {                                  │
│       clientName, email, phone, companyName,                 │
│       plan, contactPerson, country                           │
│     }                                                        │
│       │                                                      │
│       ▼                                                      │
│  2. saas_requests record created (status: Pending)           │
│       │                                                      │
│       ▼                                                      │
│  3. Super Admin reviews in SaaS Management page              │
│     Clicks "Approve"                                         │
│       │                                                      │
│       ▼                                                      │
│  4. POST /api/saas/requests/:id/provision                    │
│     Backend:                                                 │
│     a. Generate random password (12 chars)                   │
│     b. INSERT into clients (status: active, plan)            │
│     c. INSERT into users (role: client, company_id)          │
│     d. Hash password, store in users                         │
│     e. Send welcome email with credentials                   │
│     f. Update saas_request status → Provisioned              │
│       │                                                      │
│       ▼                                                      │
│  5. Response: { clientId, clientName, email, password, plan } │
│     Admin can view/copy credentials                          │
│       │                                                      │
│       ▼                                                      │
│  6. Client logs in → Full dashboard access                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Staff Shift & Payroll Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STAFF SHIFT TRACKING                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Staff opens Staff Terminal → Clicks "Clock In"              │
│  POST /api/staff/clock-in { location }                       │
│       │                                                      │
│       ▼                                                      │
│  Backend: INSERT into shifts (clock_in: NOW(), user_id)      │
│  Backend: UPDATE users SET is_available = true               │
│  Returns: shiftId                                            │
│       │                                                      │
│       ▼                                                      │
│  ... Staff works ...                                         │
│       │                                                      │
│       ▼                                                      │
│  Staff clicks "Clock Out"                                    │
│  POST /api/staff/clock-out                                   │
│       │                                                      │
│       ▼                                                      │
│  Backend:                                                    │
│  1. Find active shift (clock_out IS NULL)                    │
│  2. UPDATE shifts SET clock_out = NOW()                      │
│  3. Calculate duration_hours                                 │
│  4. UPDATE users SET is_available = false                    │
│  5. Optional: Create payroll entry based on hours            │
│       │                                                      │
│       ▼                                                      │
│  Pay History updated → Visible in "Pay & Records" tab        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Chauffeur Service Flow

```
┌─────────────────────────────────────────────────────────────┐
│              CHAUFFEUR SERVICE                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client/Concierge creates chauffeur request                  │
│  POST /api/logistics/deliveries {                            │
│    mission_type: 'Chauffeur',                                │
│    pickup_location, drop_location,                           │
│    passenger_info: JSON { passengers, luggage,               │
│      amenities, serviceType },                               │
│    status: 'Pending Review'                                  │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Delivery created (type: Chauffeur)                          │
│  Visible in Chauffeur Protocol page                          │
│       │                                                      │
│       ▼                                                      │
│  Logistics/Concierge assigns driver + vehicle                │
│  PATCH /api/logistics/deliveries/:id/status {                │
│    status: 'en_route', vehicle_id                            │
│  }                                                           │
│       │                                                      │
│       ▼                                                      │
│  Service completed                                           │
│  PATCH /api/logistics/deliveries/:id/status {                │
│    status: 'completed'                                       │
│  }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Inventory Stock Adjustment Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STOCK ADJUSTMENT                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/inventory/:id/adjust {                            │
│    quantity, type, reason, reference_type, reference_id      │
│  }                                                           │
│       │                                                      │
│       ├── type: 'entry'  → quantity INCREASED                │
│       ├── type: 'issue'  → quantity DECREASED                │
│       └── type: 'loss'   → quantity DECREASED (reason req'd) │
│       │                                                      │
│       ▼                                                      │
│  Backend:                                                    │
│  1. Get current inventory item                               │
│  2. Calculate new quantity                                   │
│  3. UPDATE inventory SET quantity = newQty                   │
│  4. Auto-set status:                                         │
│     - qty > threshold → 'in_stock'                           │
│     - 0 < qty <= threshold → 'low_stock'                     │
│     - qty = 0 → 'out_of_stock'                               │
│  5. INSERT into inventory_movements (audit trail)            │
│       │                                                      │
│       ▼                                                      │
│  Return updated item: { id, name, quantity, status }          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Dashboard Stats Aggregation

```
GET /api/dashboard/stats

Backend queries:
  1. SELECT COUNT(*) FROM orders WHERE company_id = ? → totalOrders
  2. SELECT SUM(amount) FROM invoices WHERE status='paid' AND company_id = ? → totalRevenue
  3. SELECT COUNT(*) FROM missions WHERE status IN ('pending','assigned','en_route') → activeMissions
  4. SELECT COUNT(*) FROM deliveries WHERE status='pending' → pendingDeliveries
  5. SELECT COUNT(*) FROM clients WHERE company_id = ? → totalClients
  6. SELECT COUNT(*) FROM users WHERE company_id = ? → totalStaff
  7. SELECT COUNT(*) FROM inventory WHERE status='low_stock' → lowStockItems

Return aggregated stats object.
(For superadmin: no company_id filter → global stats)
```

---

## 13. Invoice Payment Flow

```
POST /api/finance/invoices/:id/pay
{ amount, payment_method, transaction_id }

Backend:
  1. Find invoice by id
  2. INSERT into payments (invoice_id, amount, payment_method, transaction_id)
  3. UPDATE invoices SET paid_amount = paid_amount + amount
  4. If paid_amount >= amount → status = 'paid'
  5. If paid_amount < amount → status = 'partial'
  6. Return updated invoice
```

---

## 14. Frontend ↔ Backend Data Flow Summary

```
Frontend (React)                    Backend (Express)
─────────────                       ─────────────────
localStorage.token          →       auth middleware (JWT decode)
localStorage.userRole       →       req.user.role
GlobalDataContext.jsx        →       All API endpoints
  ├── fetchInitialData()     →       /dashboard/stats, /settings/system, /inventory/alerts
  ├── fetchOrders()          →       GET /orders
  ├── fetchDeliveries()      →       GET /logistics/deliveries
  ├── fetchFleet()           →       GET /logistics/vehicles
  ├── fetchProcurement()     →       GET /procurement/requests + quotes + po
  ├── fetchMissions()        →       GET /missions
  ├── fetchFinance()         →       GET /finance/invoices
  ├── fetchProjects()        →       GET /orders/projects/all
  ├── fetchTickets()         →       GET /support/tickets + events + guest-requests
  └── ... (on-demand)        →       Individual CRUD endpoints
```
