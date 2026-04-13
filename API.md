# ZaneZion Backend — Complete API Reference

> Base URL: `/api`
> All protected routes require: `Authorization: Bearer <token>`
> Standard response: `{ success: true/false, data: ..., message: "..." }`

---

## 1. AUTH — `/api/auth`

| Method | Endpoint                    | Auth | Body                                                                                   | Description                           |
| ------ | --------------------------- | ---- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| POST   | `/auth/login`               | No   | `{ email, password }`                                                                  | Login, returns JWT token + user + menuPermissions |
| POST   | `/auth/staff-register`      | No   | FormData: `{ name, email, phone, password, employment_status, birthday, bank_name, account_number, routing_number, nib_number }` + files: `passport, license, nib_doc, police_record, profile_pic` | Staff self-registration (multipart) |
| PUT    | `/auth/staff-review/:id`    | Yes  | `{ status }` — 'Active' or 'Rejected'                                                 | Admin reviews staff application       |
| POST   | `/auth/forgot-password`     | No   | `{ email }`                                                                            | Send OTP to email                     |
| POST   | `/auth/reset-password`      | No   | `{ email, otp, newPassword }`                                                          | Reset password with OTP               |

### Login Response:
```json
{
  "success": true,
  "data": {
    "token": "jwt...",
    "user": { "id": 1, "name": "...", "email": "...", "role": "super_admin", "company_id": 1 },
    "menuPermissions": [{ "name": "Dashboard", "can_view": true, "can_edit": false }]
  }
}
```

---

## 2. DASHBOARD — `/api/dashboard`

| Method | Endpoint           | Auth | Description                                              |
| ------ | ------------------ | ---- | -------------------------------------------------------- |
| GET    | `/dashboard/stats` | Yes  | Returns aggregated KPI stats (total orders, revenue, active missions, etc.) |

### Response:
```json
{
  "success": true,
  "data": {
    "totalOrders": 150,
    "totalRevenue": 245000,
    "activeMissions": 12,
    "pendingDeliveries": 8,
    "totalClients": 25,
    "totalStaff": 40,
    "lowStockItems": 3
  }
}
```

---

## 3. CLIENTS — `/api/clients`

| Method | Endpoint        | Auth | Body                                                                                                            | Description       |
| ------ | --------------- | ---- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| GET    | `/clients`      | Yes  | —                                                                                                               | List all clients  |
| GET    | `/clients/:id`  | Yes  | —                                                                                                               | Get single client |
| POST   | `/clients`      | Yes  | `{ name, email, phone, password, location, client_type, plan, billing_cycle, payment_method, contact_person, business_name, logo_url, source, status }` | Create client     |
| PUT    | `/clients/:id`  | Yes  | Same as POST (partial update allowed)                                                                           | Update client     |
| DELETE | `/clients/:id`  | Yes  | —                                                                                                               | Delete client     |

---

## 4. ORDERS — `/api/orders`

| Method | Endpoint                      | Auth | Body                                                                             | Description              |
| ------ | ----------------------------- | ---- | -------------------------------------------------------------------------------- | ------------------------ |
| GET    | `/orders`                     | Yes  | —                                                                                | List all orders (scoped by company_id) |
| POST   | `/orders`                     | Yes  | `{ client_id, company_id, vendor_id, type, items, notes, status }`               | Create order             |
| PUT    | `/orders/:id`                 | Yes  | Full order update body                                                           | Update order             |
| PATCH  | `/orders/:id/status`          | Yes  | `{ status }`                                                                     | Update order status only |
| DELETE | `/orders/:id`                 | Yes  | —                                                                                | Delete order             |
| POST   | `/orders/convert/:orderId`    | Yes  | `{ name, description, manager_id, startDate, location, status, company_id }`     | Convert order → project  |

### Projects (nested under orders):

| Method | Endpoint                    | Auth | Body                                                                            | Description        |
| ------ | --------------------------- | ---- | ------------------------------------------------------------------------------- | ------------------ |
| GET    | `/orders/projects/all`      | Yes  | —                                                                               | List all projects  |
| POST   | `/orders/projects`          | Yes  | `{ name, description, manager_id, startDate, location, status, company_id }`    | Create project     |
| PUT    | `/orders/projects/:id`      | Yes  | `{ name, description, status, location, start_date, manager_id }`               | Update project     |
| DELETE | `/orders/projects/:id`      | Yes  | —                                                                               | Delete project     |

---

## 5. MISSIONS — `/api/missions`

| Method | Endpoint                         | Auth | Body                                    | Description                 |
| ------ | -------------------------------- | ---- | --------------------------------------- | --------------------------- |
| GET    | `/missions`                      | Yes  | —                                       | List all missions           |
| POST   | `/missions/convert/:orderId`     | Yes  | Mission data                            | Convert order → mission     |
| PUT    | `/missions/:id/status`           | Yes  | `{ status }`                            | Update mission status       |
| POST   | `/missions/:id/assign`           | Yes  | `{ driverId, vehicleId }`               | Assign driver to mission    |
| DELETE | `/missions/:id`                  | Yes  | —                                       | Delete mission              |

### Mission response includes JOINs:
```json
{
  "id": 1,
  "order_id": 5,
  "mission_type": "Delivery",
  "assigned_driver": 3,
  "driver_name": "John Smith",
  "vehicle_id": 2,
  "plate_number": "BAH-1234",
  "status": "en_route",
  "event_date": "2026-04-01"
}
```

---

## 6. VENDORS — `/api/vendors`

| Method | Endpoint        | Auth | Body                                                               | Description       |
| ------ | --------------- | ---- | ------------------------------------------------------------------ | ----------------- |
| GET    | `/vendors`      | Yes  | —                                                                  | List all vendors  |
| POST   | `/vendors`      | Yes  | `{ name, email, phone, contact_name, category, location, status }` | Create vendor     |
| PUT    | `/vendors/:id`  | Yes  | Same as POST                                                       | Update vendor     |
| DELETE | `/vendors/:id`  | Yes  | —                                                                  | Delete vendor     |

---

## 7. INVENTORY — `/api/inventory`

| Method | Endpoint                  | Auth | Body                                                                                               | Description          |
| ------ | ------------------------- | ---- | -------------------------------------------------------------------------------------------------- | -------------------- |
| GET    | `/inventory`              | Yes  | —                                                                                                  | List all items       |
| GET    | `/inventory/alerts`       | Yes  | —                                                                                                  | Low stock alerts     |
| POST   | `/inventory`              | Yes  | `{ name, sku, category, price, quantity, warehouse_id, vendor_id, client_id, inventory_type }`     | Create item          |
| PUT    | `/inventory/:id`          | Yes  | `{ name, category, price, quantity, warehouse_id, vendor_id, client_id }`                          | Update item          |
| DELETE | `/inventory/:id`          | Yes  | —                                                                                                  | Delete item          |
| POST   | `/inventory/:id/adjust`   | Yes  | `{ quantity, type, reason, reference_type, reference_id }`                                         | Stock adjustment (entry/issue/loss) |

### Adjust Response:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "name": "Champagne",
    "quantity": 45,
    "status": "in_stock"
  }
}
```

---

## 8. WAREHOUSES — `/api/warehouses`

| Method | Endpoint           | Auth | Body                                                     | Description        |
| ------ | ------------------ | ---- | -------------------------------------------------------- | ------------------ |
| GET    | `/warehouses`      | Yes  | —                                                        | List all           |
| POST   | `/warehouses`      | Yes  | `{ name, location, capacity, manager_id, company_id }`   | Create warehouse   |
| PUT    | `/warehouses/:id`  | Yes  | Same as POST                                             | Update warehouse   |
| DELETE | `/warehouses/:id`  | Yes  | —                                                        | Delete warehouse   |

---

## 9. PROCUREMENT — `/api/procurement`

### Purchase Requests:

| Method | Endpoint                   | Auth | Body                                                                                | Description           |
| ------ | -------------------------- | ---- | ----------------------------------------------------------------------------------- | --------------------- |
| GET    | `/procurement/requests`    | Yes  | —                                                                                   | List all PRs          |
| POST   | `/procurement/requests`    | Yes  | `{ item_name, category, quantity, estimated_cost, requester, priority, notes }`     | Create PR             |
| PUT    | `/procurement/requests/:id`| Yes  | Same as POST                                                                        | Update PR             |
| DELETE | `/procurement/requests/:id`| Yes  | —                                                                                   | Delete PR             |

### Quotes:

| Method | Endpoint                | Auth | Body                                                                             | Description       |
| ------ | ----------------------- | ---- | -------------------------------------------------------------------------------- | ----------------- |
| GET    | `/procurement/quotes`   | Yes  | —                                                                                | List all quotes   |
| POST   | `/procurement/quotes`   | Yes  | `{ vendor_id, purchase_request_id, items, total_amount, validity_date, notes }`  | Create quote      |
| PUT    | `/procurement/quotes/:id` | Yes | Same as POST                                                                     | Update quote      |
| DELETE | `/procurement/quotes/:id` | Yes | —                                                                                | Delete quote      |

### Purchase Orders:

| Method | Endpoint                      | Auth | Body                                                                           | Description         |
| ------ | ----------------------------- | ---- | ------------------------------------------------------------------------------ | ------------------- |
| GET    | `/procurement/po`             | Yes  | —                                                                              | List all POs        |
| POST   | `/procurement/po`             | Yes  | `{ vendorId, items: [{ name, category, quantity, unit_price }], total_amount, notes }` | Create PO  |
| PUT    | `/procurement/po/:id`         | Yes  | Same as POST                                                                   | Update PO           |
| PUT    | `/procurement/po/:id/receive` | Yes  | `[{ id, receivedQty }]`                                                        | Receive goods       |

---

## 10. LOGISTICS — `/api/logistics`

### Vehicles (Fleet):

| Method | Endpoint               | Auth | Body                                                                                                                    | Description       |
| ------ | ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| GET    | `/logistics/vehicles`  | Yes  | —                                                                                                                       | List all vehicles |
| POST   | `/logistics/vehicles`  | Yes  | `{ plate_number, model, type, vehicle_type, capacity, fuel_level, insurance_policy, registration_expiry, inspection_date, diagnostic_status }` | Add vehicle  |
| PUT    | `/logistics/vehicles/:id` | Yes | Same as POST + `{ status }`                                                                                             | Update vehicle    |
| DELETE | `/logistics/vehicles/:id` | Yes | —                                                                                                                       | Delete vehicle    |

### Deliveries:

| Method | Endpoint                             | Auth | Body                                                                                                       | Description            |
| ------ | ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
| GET    | `/logistics/deliveries`              | Yes  | —                                                                                                          | List all deliveries    |
| POST   | `/logistics/deliveries`              | Yes  | `{ order_id, route, driver_name, plate_number, package_details, status, mission_type, pickup_location, drop_location, passenger_info }` | Create delivery |
| PATCH  | `/logistics/deliveries/:id/status`   | Yes  | `{ status, vehicle_id, signature }`                                                                        | Update delivery status |
| DELETE | `/logistics/deliveries/:id`          | Yes  | —                                                                                                          | Delete delivery        |

### Routes:

| Method | Endpoint              | Auth | Body                                                          | Description      |
| ------ | --------------------- | ---- | ------------------------------------------------------------- | ---------------- |
| GET    | `/logistics/routes`   | Yes  | —                                                             | List all routes  |
| POST   | `/logistics/routes`   | Yes  | `{ name, start_location, end_location, distance_km, estimated_time }` | Create route |
| PUT    | `/logistics/routes/:id` | Yes | Same as POST                                                  | Update route     |
| DELETE | `/logistics/routes/:id` | Yes | —                                                             | Delete route     |

### Pricing:

| Method | Endpoint                  | Auth | Body          | Description         |
| ------ | ------------------------- | ---- | ------------- | ------------------- |
| GET    | `/logistics/pricing`      | Yes  | —             | List pricing tiers  |
| PUT    | `/logistics/pricing/:id`  | Yes  | `{ price }`   | Update price tier   |

---

## 11. FINANCE — `/api/finance`

### Invoices:

| Method | Endpoint                       | Auth | Body                                            | Description          |
| ------ | ------------------------------ | ---- | ----------------------------------------------- | -------------------- |
| GET    | `/finance/invoices`            | Yes  | —                                               | List all invoices    |
| POST   | `/finance/invoices`            | Yes  | `{ order_id, client_id, amount, due_date, status }` | Create invoice  |
| PUT    | `/finance/invoices/:id`        | Yes  | `{ amount, due_date, status }`                  | Update invoice       |
| DELETE | `/finance/invoices/:id`        | Yes  | —                                               | Delete invoice       |
| POST   | `/finance/invoices/:id/pay`    | Yes  | `{ amount, payment_method, transaction_id }`    | Record payment       |

### Payroll:

| Method | Endpoint              | Auth | Description                        |
| ------ | --------------------- | ---- | ---------------------------------- |
| GET    | `/finance/my-payroll` | Yes  | Get current user's payroll history |

---

## 12. STAFF — `/api/staff`

| Method | Endpoint                     | Auth | Body                                                                                                               | Description            |
| ------ | ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| GET    | `/staff/assignments`         | Yes  | —                                                                                                                  | List assignments       |
| POST   | `/staff/assignments`         | Yes  | `{ assigneeId, task, location, status, priority, missionType, passengerName, pickupTime, dropLocation, luggage, goodsDetails, weight, pickupLocation, deliveryLocation }` | Create assignment |
| PUT    | `/staff/assignments/:id`     | Yes  | Same as POST                                                                                                       | Update assignment      |
| POST   | `/staff/clock-in`            | Yes  | `{ location }`                                                                                                     | Clock in (start shift) |
| POST   | `/staff/clock-out`           | Yes  | —                                                                                                                  | Clock out (end shift)  |
| PUT    | `/staff/:userId`             | Yes  | `{ is_available }`                                                                                                 | Toggle availability    |
| GET    | `/staff/leave`               | Yes  | —                                                                                                                  | List leave requests    |
| POST   | `/staff/leave`               | Yes  | `{ leave_type, start_date, end_date, reason }`                                                                     | Submit leave request   |
| PUT    | `/staff/leave/:id`           | Yes  | `{ status }` — approved/rejected/pending                                                                           | Approve/reject leave   |

---

## 13. SUPPORT — `/api/support`

### Tickets:

| Method | Endpoint                       | Auth | Body                                          | Description         |
| ------ | ------------------------------ | ---- | --------------------------------------------- | ------------------- |
| GET    | `/support/tickets`             | Yes  | —                                             | List all tickets    |
| POST   | `/support/tickets`             | Yes  | `{ subject, description, priority }`          | Create ticket       |
| PATCH  | `/support/tickets/:id/status`  | Yes  | `{ status }`                                  | Update status       |

### Events:

| Method | Endpoint              | Auth | Body                                                        | Description      |
| ------ | --------------------- | ---- | ----------------------------------------------------------- | ---------------- |
| GET    | `/support/events`     | Yes  | —                                                           | List all events  |
| POST   | `/support/events`     | Yes  | `{ name, event_date, location, client_id, manager_id, status }` | Create event |
| PUT    | `/support/events/:id` | Yes  | Same as POST                                                | Update event     |
| DELETE | `/support/events/:id` | Yes  | —                                                           | Delete event     |

### Guest Requests:

| Method | Endpoint                       | Auth | Body                                                                                | Description          |
| ------ | ------------------------------ | ---- | ----------------------------------------------------------------------------------- | -------------------- |
| GET    | `/support/guest-requests`      | Yes  | —                                                                                   | List guest requests  |
| POST   | `/support/guest-requests`      | Yes  | `{ client_id, guest, requested_by, request_details, delivery_time, priority, status }` | Create request    |
| PUT    | `/support/guest-requests/:id`  | Yes  | Same as POST                                                                        | Update request       |
| DELETE | `/support/guest-requests/:id`  | Yes  | —                                                                                   | Delete request       |

### Chauffeur Requests:

| Method | Endpoint                       | Auth | Description                                    |
| ------ | ------------------------------ | ---- | ---------------------------------------------- |
| GET    | `/support/chauffeur-requests`  | Yes  | List chauffeur deliveries (mission_type = Chauffeur) |

### Audits:

| Method | Endpoint              | Auth | Body                                                | Description      |
| ------ | --------------------- | ---- | --------------------------------------------------- | ---------------- |
| GET    | `/support/audits`     | Yes  | —                                                   | List audits      |
| POST   | `/support/audits`     | Yes  | `{ title, type, description, status }`              | Create audit     |
| PUT    | `/support/audits/:id` | Yes  | Same as POST                                        | Update audit     |
| DELETE | `/support/audits/:id` | Yes  | —                                                   | Delete audit     |

---

## 14. CONCIERGE — `/api/concierge`

### Luxury Items:

| Method | Endpoint                    | Auth | Body                                                                          | Description         |
| ------ | --------------------------- | ---- | ----------------------------------------------------------------------------- | ------------------- |
| GET    | `/concierge/luxury-items`   | Yes  | —                                                                             | List luxury items   |
| POST   | `/concierge/luxury-items`   | Yes  | `{ item_name, owner_name, vault_location, estimated_value, status, notes }`   | Add luxury item     |
| PUT    | `/concierge/luxury-items/:id` | Yes | Same as POST                                                                  | Update luxury item  |
| DELETE | `/concierge/luxury-items/:id` | Yes | —                                                                             | Delete luxury item  |

---

## 15. SaaS — `/api/saas`

### Plans:

| Method | Endpoint          | Auth | Body                                                                   | Description      |
| ------ | ----------------- | ---- | ---------------------------------------------------------------------- | ---------------- |
| GET    | `/saas/plans`     | Yes  | —                                                                      | List all plans   |
| POST   | `/saas/plans`     | Yes  | `{ name, price, billing_cycle, features, max_users, max_orders }`      | Create plan      |
| PUT    | `/saas/plans/:id` | Yes  | Same as POST                                                           | Update plan      |
| DELETE | `/saas/plans/:id` | Yes  | —                                                                      | Delete plan      |

### Subscription Requests:

| Method | Endpoint                         | Auth | Body                                                                    | Description               |
| ------ | -------------------------------- | ---- | ----------------------------------------------------------------------- | ------------------------- |
| GET    | `/saas/requests`                 | Yes  | —                                                                       | List subscription requests |
| POST   | `/saas/submit`                   | No*  | `{ clientName, email, phone, companyName, plan, contactPerson, country }` | Submit request (landing page) |
| POST   | `/saas/requests/:id/provision`   | Yes  | —                                                                       | Approve & provision client (creates user + client) |
| PUT    | `/saas/requests/:id/status`      | Yes  | `{ status }`                                                            | Update request status     |
| DELETE | `/saas/requests/:id`             | Yes  | —                                                                       | Delete request            |

### Provision Response:
```json
{
  "success": true,
  "data": {
    "clientId": 15,
    "clientName": "Luxury Corp",
    "email": "admin@luxurycorp.com",
    "password": "auto-generated-password",
    "plan": "Platinum"
  }
}
```

---

## 16. SETTINGS — `/api/settings`

| Method | Endpoint            | Auth | Body                     | Description          |
| ------ | ------------------- | ---- | ------------------------ | -------------------- |
| GET    | `/settings/system`  | Yes  | —                        | Get system settings  |
| PUT    | `/settings/system`  | Yes  | `{ key: value, ... }`   | Update settings      |

---

## API Count Summary

| Module      | Endpoints |
| ----------- | --------- |
| Auth        | 5         |
| Dashboard   | 1         |
| Clients     | 5         |
| Orders      | 10        |
| Missions    | 5         |
| Vendors     | 4         |
| Inventory   | 6         |
| Warehouses  | 4         |
| Procurement | 11        |
| Logistics   | 13        |
| Finance     | 6         |
| Staff       | 8         |
| Support     | 12        |
| Concierge   | 4         |
| SaaS        | 8         |
| Settings    | 2         |
| **TOTAL**   | **104**   |
