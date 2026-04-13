# ZaneZion — Product Requirements Document (PRD)

## 1. Product Overview

**ZaneZion** is a Luxury Concierge Management System — a multi-tenant SaaS platform for managing premium hospitality operations. It serves as the operational backbone for luxury concierge businesses in The Bahamas and similar high-end markets.

### Target Users
- **Platform Owner (Super Admin)**: Manages the entire SaaS platform, onboards clients
- **Business Owners (Client Role)**: Companies that subscribe and manage their operations
- **SaaS Clients**: External customers who self-register via landing page
- **Staff (Department Roles)**: Operations, Procurement, Logistics, Inventory, Concierge, Field Staff

---

## 2. Core Business Modules

### 2.1 Authentication & User Management
- **Login**: Email + Password + Role selection
- **Staff Self-Registration**: Multi-step form with document uploads (passport, license, NIB, police record, photo)
- **Staff Review**: Admin approves/rejects staff applications
- **Password Recovery**: Email OTP → Verify → Reset flow
- **Role-Based Access Control (RBAC)**: 8 roles with different permissions
- **Menu Permissions**: Granular per-role menu visibility (can_view, can_create, can_edit, can_delete)

### 2.2 Client Management
- Full CRUD for clients (businesses)
- Client types: Direct, SaaS, Enterprise, Individual
- Client branding (business name, tagline, logo)
- Plan assignment (Platinum, Executive, Essentials)
- Billing cycle management

### 2.3 Order Management
- Create orders with multiple line items (items JSON)
- Order lifecycle: pending_review → approved → in_progress → dispatched → delivered → completed
- **Order → Project conversion**: Convert an order into a tracked project
- **Order → Mission conversion**: Convert an order into a logistics mission
- Auto-invoice generation when delivery is completed

### 2.4 Project Management
- Projects linked to orders
- Assigned manager, client, location
- Status tracking: Planned → In Progress → Completed → On Hold
- Auto-creates delivery entry when project is created

### 2.5 Mission Management
- Missions created from orders
- Mission types: Delivery, Pickup, Transfer, Chauffeur, Custom
- Driver and vehicle assignment
- Status flow: pending → assigned → en_route → completed

### 2.6 Procurement
- **Purchase Requests**: Staff submits item procurement needs
- **Vendor Quotes**: Compare quotes from multiple vendors
- **Purchase Orders**: Formal POs to vendors with line items
- **Goods Receiving**: Receive goods against PO (partial receiving supported)
- Links: PR → Quote → PO → Goods Receiving → Inventory Update

### 2.7 Inventory Management
- Full CRUD for inventory items
- Stock adjustments: Entry, Issue, Loss (with reasons)
- Auto stock level tracking (in_stock, low_stock, out_of_stock)
- Threshold-based alerts
- Warehouse assignment
- Inventory types: Marketplace, Internal, Client
- Stock movement history via inventory_movements table

### 2.8 Warehouse Management
- Multiple warehouses per company
- Assign warehouse managers
- Track capacity and status

### 2.9 Logistics & Fleet
- **Fleet Management**: Add/edit/delete vehicles with plate number, type, fuel level, insurance, registration, diagnostic status
- **Deliveries**: Create, track, update delivery status, confirm with signature
- **Route Management**: Define logistics corridors with distance and estimated time
- **Vehicle Dispatch**: Assign vehicle to delivery, update status to en_route
- **Delivery Pricing**: Tiered pricing management
- **Chauffeur Service**: Special delivery type for VIP transport with passenger info

### 2.10 Finance
- **Invoices**: CRUD + auto-generation from orders/deliveries
- **Payments**: Record payment against invoice (partial payments supported)
- **Revenue Analytics**: Daily/Weekly/Monthly/Yearly filtering on paid invoices
- **Payroll**: Staff pay history based on shifts/hours
- **SaaS Invoice Generation**: Auto-generate subscription invoices for SaaS clients

### 2.11 Staff Management
- **Assignments**: Create tasks for staff (general, chauffeur, delivery, goods transport)
- **Clock In/Out**: Shift tracking with location
- **Availability Toggle**: Staff online/offline status
- **Leave Management**: Submit, approve/reject leave requests
- **Vacation Balance**: Auto-calculated based on employment type and tenure
- **Pay Records**: View pay history

### 2.12 Concierge & Events
- **Events**: Plan and manage luxury events with client association
- **Guest Requests**: VIP guest service requests with priority and delivery time
- **Luxury Items**: Vault management for high-value items (watches, jewelry, art)
- **VIP Access Plans**: Tiered concierge service plans

### 2.13 Support
- **Support Tickets**: Client-facing ticket system
- **Audit Logs**: Compliance and inventory audits
- **Chauffeur Requests**: View/manage chauffeur service requests

### 2.14 SaaS Platform (Super Admin)
- **Plan Management**: CRUD for subscription plans with features, pricing, user limits
- **Subscription Requests**: Review requests from landing page
- **Client Provisioning**: One-click provisioning (creates client + user + generates credentials)
- **SaaS Client Management**: View, activate, suspend SaaS clients

### 2.15 Settings
- System-wide settings (key-value pairs)
- Per-company settings support

---

## 3. Non-Functional Requirements

### Security
- JWT-based authentication (7-day expiry)
- bcrypt password hashing (12 salt rounds)
- Role-based middleware on every route
- Company-scoped data isolation (multi-tenancy)
- File upload validation (size, type)
- SQL injection prevention (parameterized queries)
- CORS configured for frontend origin only

### Performance
- Connection pooling for MySQL (10 connections)
- Lazy loading on frontend (code-split by route)
- Efficient bulk queries (Promise.all for initial data fetch)

### Scalability
- Multi-tenant architecture (company_id scoping)
- Stateless JWT auth (no server sessions)
- Horizontal scaling ready (Railway auto-scaling)

---

## 4. User Roles & Permissions Matrix

| Feature             | Super Admin | Client | SaaS Client | Operations | Procurement | Logistics | Inventory | Concierge | Staff |
| ------------------- | ----------- | ------ | ----------- | ---------- | ----------- | --------- | --------- | --------- | ----- |
| Dashboard           | Full        | Full   | Own data    | Own dept   | Own dept    | Own dept  | Own dept  | Own dept  | Terminal |
| Clients             | CRUD        | CRUD   | -           | View       | -           | -         | -         | -         | -     |
| Orders              | CRUD        | CRUD   | Own orders  | CRUD       | View        | -         | -         | View      | -     |
| Projects            | CRUD        | CRUD   | View        | CRUD       | -           | -         | -         | -         | -     |
| Missions            | CRUD        | CRUD   | -           | CRUD       | -           | View      | -         | -         | -     |
| Deliveries          | CRUD        | CRUD   | -           | CRUD       | -           | CRUD      | -         | -         | -     |
| Fleet               | CRUD        | -      | -           | -          | -           | CRUD      | -         | -         | -     |
| Inventory           | CRUD        | CRUD   | -           | -          | -           | -         | CRUD      | View      | -     |
| Warehouses          | CRUD        | -      | -           | -          | -           | -         | CRUD      | -         | -     |
| Vendors             | CRUD        | -      | -           | -          | CRUD        | -         | -         | -         | -     |
| Purchase Requests   | CRUD        | CRUD   | -           | -          | CRUD        | -         | -         | -         | -     |
| Invoices            | CRUD        | CRUD   | Own         | View       | View        | -         | -         | -         | -     |
| Staff Management    | CRUD        | CRUD   | -           | -          | -           | -         | -         | -         | -     |
| Payroll             | CRUD        | CRUD   | -           | -          | -           | -         | -         | -         | Own   |
| Events              | CRUD        | CRUD   | Book        | -          | -           | -         | -         | CRUD      | -     |
| Guest Requests      | CRUD        | CRUD   | Request     | -          | -           | -         | -         | CRUD      | -     |
| Luxury Items        | CRUD        | -      | -           | -          | -           | -         | -         | CRUD      | -     |
| Chauffeur           | CRUD        | CRUD   | Book        | -          | -           | -         | -         | CRUD      | -     |
| Support Tickets     | CRUD        | CRUD   | Submit      | -          | -           | -         | -         | -         | -     |
| Reports             | Full        | Full   | -           | -          | -           | -         | -         | -         | -     |
| Settings            | Full        | Own    | Own         | Own        | Own         | Own       | Own       | Own       | Own   |
| SaaS Plans          | CRUD        | -      | -           | -          | -           | -         | -         | -         | -     |
| SaaS Clients        | CRUD        | -      | -           | -          | -           | -         | -         | -         | -     |

---

## 5. Key Business Flows

### Flow 1: Order → Delivery → Invoice (Standard)
```
Client submits order → Admin reviews → Approved → 
Operations creates Delivery → Logistics dispatches vehicle → 
Driver completes delivery → Client confirms receipt (signature) → 
System auto-generates invoice → Client pays invoice
```

### Flow 2: Order → Project → Delivery (Complex)
```
Client submits order → Admin converts to Project →
Operations assigns manager → Project tracked → 
When ready, delivery created → Logistics handles dispatch →
Delivery completed → Invoice generated
```

### Flow 3: Order → Mission (Logistics Focus)
```
Order created → Converted to Mission → 
Driver + Vehicle assigned → Status: en_route →
Mission completed → Order status updated
```

### Flow 4: Procurement Cycle
```
Staff submits Purchase Request → 
Procurement gets vendor Quotes → 
Best quote selected → Purchase Order created →
Goods received → Inventory updated → 
Purchase Request marked Received
```

### Flow 5: SaaS Client Onboarding
```
Visitor fills form on Landing Page → 
Subscription Request created → 
Super Admin reviews → Approves → 
System provisions: Creates Client + User + Generates password →
Credentials shared → Client logs in
```

### Flow 6: Staff Onboarding
```
Staff visits /staff-signup → Fills 3-step form + uploads docs →
Application submitted (status: pending) →
Admin reviews at Staff Audits → Approves/Rejects →
If approved: Staff can login → Appears in Staff Terminal
```

### Flow 7: Chauffeur Service
```
Client/Concierge creates chauffeur request →
Request saved as delivery (mission_type: Chauffeur) →
Logistics reviews → Assigns driver + vehicle →
Service completed → Status updated
```
