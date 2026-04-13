# ZaneZion Backend Architecture

## Tech Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Runtime        | Node.js (v18+)                   |
| Framework      | Express.js                       |
| Database       | MySQL (Railway / PlanetScale)    |
| ORM            | mysql2 (raw queries) or Knex.js  |
| Auth           | JWT (jsonwebtoken) + bcryptjs    |
| File Upload    | Multer (multipart/form-data)     |
| Email          | Nodemailer (SMTP)                |
| Validation     | express-validator / Joi          |
| CORS           | cors middleware                  |
| Env Config     | dotenv                           |
| Hosting        | Railway (current production)     |

---

## Folder Structure

```
zanezion-backend/
├── server.js                  # Entry point — starts Express server
├── package.json
├── .env                       # Environment variables (DB, JWT_SECRET, SMTP)
├── .env.example               # Template for env variables
│
├── config/
│   └── db.js                  # MySQL connection pool (mysql2/promise)
│
├── middleware/
│   ├── auth.js                # JWT verification middleware (verifyToken)
│   ├── role.js                # Role-based access middleware (requireRole)
│   ├── upload.js              # Multer configuration for file uploads
│   └── errorHandler.js        # Global error handler
│
├── routes/
│   ├── auth.js                # /api/auth/*        — Login, Register, Forgot/Reset Password, Staff Signup
│   ├── dashboard.js           # /api/dashboard/*    — Dashboard stats
│   ├── clients.js             # /api/clients/*      — Client CRUD
│   ├── orders.js              # /api/orders/*       — Orders + Projects + Convert
│   ├── missions.js            # /api/missions/*     — Missions CRUD + Assign Driver
│   ├── vendors.js             # /api/vendors/*      — Vendor CRUD
│   ├── inventory.js           # /api/inventory/*    — Inventory CRUD + Adjust + Alerts
��   ├── warehouses.js          # /api/warehouses/*   — Warehouse CRUD
│   ├── procurement.js         # /api/procurement/*  — Purchase Requests, Quotes, POs
│   ├── logistics.js           # /api/logistics/*    — Vehicles, Deliveries, Routes, Pricing
│   ├── finance.js             # /api/finance/*      — Invoices + Payments + Payroll
│   ├── staff.js               # /api/staff/*        — Assignments, Clock In/Out, Leave, Availability
│   ├── support.js             # /api/support/*      — Tickets, Events, Guest Requests, Audits, Chauffeur
│   ├── concierge.js           # /api/concierge/*    — Luxury Items
│   ├── saas.js                # /api/saas/*         — Plans, Subscription Requests, Provisioning
│   └── settings.js            # /api/settings/*     — System Settings
│
├── controllers/
│   ├── authController.js
│   ├── dashboardController.js
│   ├── clientController.js
│   ├── orderController.js
│   ├── missionController.js
│   ├── vendorController.js
│   ├── inventoryController.js
│   ├── warehouseController.js
│   ├── procurementController.js
│   ├── logisticsController.js
│   ├── financeController.js
│   ├── staffController.js
│   ├── supportController.js
│   ├── conciergeController.js
│   ├── saasController.js
│   └── settingsController.js
│
├── utils/
│   ├── helpers.js             # Shared utility functions
│   └── mailer.js              # Email sending utility (Nodemailer)
│
└── uploads/                   # Uploaded files (staff docs, logos, etc.)
```

---

## Request/Response Standard

All API responses follow this format:

### Success
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Success (List)
```json
{
  "success": true,
  "data": [ ... ],
  "count": 25
}
```

### Error
```json
{
  "success": false,
  "message": "Error description here"
}
```

---

## Authentication Flow

```
1. POST /api/auth/login
   → Validate email + password (bcrypt compare)
   → Generate JWT token (payload: { id, email, role, company_id })
   → Return { token, user, menuPermissions }

2. Every subsequent request:
   → Client sends: Authorization: Bearer <token>
   → auth.js middleware decodes JWT
   → Attaches req.user = { id, email, role, company_id }

3. Role-based access:
   → role.js middleware checks req.user.role against allowed roles
   → Returns 403 if not authorized
```

---

## Multi-Tenancy Model

ZaneZion supports multi-tenant SaaS architecture:

- **Super Admin**: Platform owner, manages all clients and staff
- **Client (Business Owner)**: Owns a company, manages their own staff, orders, inventory
- **SaaS Client**: External customer who subscribed via landing page
- **Staff Roles**: Operations, Procurement, Logistics, Inventory, Concierge — all belong to a `company_id`

Data isolation is achieved via `company_id` column on most tables. Middleware automatically filters data by `req.user.company_id` unless the user is `superadmin`.

---

## Middleware Chain

```
Request → CORS → JSON Parser → Route Match → verifyToken → requireRole → Controller → Response
                                                                             ↓
                                                                       errorHandler
```

---

## Environment Variables (.env)

```env
# Server
PORT=5000
NODE_ENV=production

# Database
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=zanezion

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# SMTP (for password reset & notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
```
