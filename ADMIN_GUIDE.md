# Admin & Super Admin Management Guide

## Dashboard Locations

### App view (leads directory)
- **URL**: `/app` (after login)
- **Shell**: `frontend/src/components/AppShell.jsx`
- **Page**: `frontend/src/pages/app/DirectoryPage.jsx`
- The product-facing directory: search, industry filter, "Near Me" geo search,
  card grid of leads, detail modal, load-more pagination.

### Dashboard (CMS workspace)
- **URL**: `/admin`
- **Shell**: `frontend/src/components/DashboardLayout.jsx` (responsive sidebar +
  topbar + user card + logout, shared by every dashboard section)
- **Pages** (`frontend/src/pages/admin/`):
  - `AdminOverviewPage.jsx` — stat cards (total/verified leads, industries,
    countries/regions/cities), recent leads, quick actions
  - `LeadsPage.jsx` — full lead table with search, industry filter,
    "Near Me", verification badges, detail modal
  - `AddLeadPage.jsx` — manually create a single lead (editor+)
  - `ImportLeadsPage.jsx` — bulk CSV import with drag & drop, downloadable
    template, and per-row error report (editor+)
  - `UsersPage.jsx` — user management (admin+)
  - `RolesPage.jsx` — roles & permissions viewer (admin+)

All authenticated users can open the dashboard; lead management actions
(Add Lead / Import CSV) are shown only to `editor`, `admin`, `super_admin`
and enforced server-side with `requireRole()`.

---

## Roles & Permissions System

### Available Roles (from seed data)
| Role | Permissions |
|------|-------------|
| `super_admin` | All permissions |
| `admin` | users.read, users.manage, leads.read, leads.export, admin.access |
| `editor` | leads.read, leads.export |
| `user` | leads.read (default for new users) |

### Permissions Breakdown
- `users.read` - View all users
- `users.manage` - Create/update/delete users
- `roles.manage` - Manage roles and permissions
- `leads.read` - View leads
- `leads.export` - Export leads data
- `admin.access` - Access admin dashboard

---

## How to Create Admin/Super Admin Users

### Method 1: Using the CLI Script (Recommended for First Admin)

1. **Run the backend server first:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Run the seed to create roles:**
   ```bash
   node src/db/seed.js
   ```

3. **Create an admin user:**
   ```bash
   node src/db/createAdmin.js \
     --email admin@example.com \
     --role admin \
     --password MySecurePass123
   ```

4. **Create a super_admin user:**
   ```bash
   node src/db/createAdmin.js \
     --email super@example.com \
     --role super_admin \
     --password SuperSecret123
   ```

**Output example:**
```
Created new user admin@example.com (ID: 550e8400-e29b-41d4-a716-446655440000)
Assigned role: admin to admin@example.com

admin@example.com now has roles: admin

✅ Admin creation complete!
   Email: admin@example.com
   Role: admin
```

---

### Method 2: Using the Admin Dashboard UI

1. **Log in with an existing admin account** (or create one via CLI first)

2. **Navigate to `/admin`**

3. **Create a new user:**
   - Click the "+ Create User" button
   - Fill in email, password, name, and select role
   - Click "Create"

4. **Assign/change roles:**
   - Find the user in the table
   - Use the "+ Add Role" dropdown to assign a new role
   - Click the × on a role badge to remove it

5. **Activate/Deactivate users:**
   - Click "Deactivate" to disable a user account
   - Click "Activate" to re-enable

---

### Method 3: Direct SQL (Manual)

Connect to your PostgreSQL database:

```sql
-- 1. Ensure roles exist (run seed first)
INSERT INTO roles (name) VALUES 
  ('user'), ('editor'), ('admin'), ('super_admin')
ON CONFLICT (name) DO NOTHING;

-- 2. Create the user (or update existing)
INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active)
VALUES ('admin@example.com', '$argon2id$...', 'Admin', 'User', true, true)
ON CONFLICT (email) DO UPDATE SET is_email_verified = true;

-- 3. Get the user's ID
SELECT id FROM users WHERE email = 'admin@example.com';

-- 4. Get the role ID
SELECT id FROM roles WHERE name = 'admin';

-- 5. Assign the role
INSERT INTO user_roles (user_id, role_id) 
VALUES ('<user-uuid>', '<role-id>')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 6. Verify
SELECT u.email, array_agg(r.name) as roles
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'admin@example.com'
GROUP BY u.id;
```

---

## Admin API Endpoints

The backend exposes these admin endpoints at `/api/admin/*`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/:id` | Get single user |
| POST | `/api/admin/users` | Create new user |
| PATCH | `/api/admin/users/:id/role` | Assign/remove role |
| PATCH | `/api/admin/users/:id/active` | Toggle active status |
| GET | `/api/admin/roles` | List all roles with permissions |

### Example: Assign admin role via API

```bash
# Login first to get token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "MySecurePass123"}'

# Then assign role
curl -X PATCH http://localhost:3001/api/admin/users/<user-id>/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"role": "admin", "action": "assign"}'
```

---

## After Adding Users

1. **New users get the default `user` role** unless assigned otherwise
2. **User can log in** and access `/app` to search leads
3. **Admins can access `/admin`** to manage other users
4. **Super Admin** has full access to everything
5. **Editors** can search and export leads (useful for marketing teams)
6. **Regular Users** can only search leads (free tier)

---

## Important Notes

- **Self-demotion protection**: Super admins cannot remove their own super_admin role
- **Self-deactivation protection**: Users cannot deactivate their own account
- **Auto-verification**: When an admin creates a user, email is auto-verified
- **Session persistence**: Uses JWT access tokens (15 min) + httpOnly refresh cookies
- **Token rotation**: Refresh tokens are rotated on each use with reuse detection
