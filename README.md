# TaskPilot 🚀

> **Live URL:** `https://taskpilot-production-8fad.up.railway.app` *(update after deployment)*  
> **GitHub:** `https://github.com/your-username/projectpilot`

A full-stack project & task management app with **role-based access control (Admin / Member)**, built with **Node.js + Express + PostgreSQL**.

---

## ✅ Requirement Status

- [x] Authentication (signup/login with JWT + hashed passwords)
- [x] Project and team management
- [x] Task creation, assignment, status tracking
- [x] Dashboard (status metrics + overdue tasks)
- [x] REST APIs with SQL database (PostgreSQL)
- [x] Role-based access control (Admin/Member)
- [x] Added API-level validation and relationship checks for project/task/assignee consistency
- [ ] Replace placeholder links in this README with your real Railway URL and GitHub repo URL
- [ ] Deploy on Railway and verify production DB schema is applied

---

## 🌟 Features

| Feature | Details |
|---|---|
| **Authentication** | JWT-based signup/login with bcrypt password hashing |
| **Role-Based Access** | Admin can create/edit/delete projects & manage team; Members can view and update their own tasks |
| **Project Management** | Create, edit, delete projects with color tags and due dates |
| **Task Management** | Create tasks with priority, status, assignee, due date; Kanban board view |
| **Dashboard** | Stats overview, progress per project, recent activity, overdue table |
| **Team Management** | Invite members, toggle roles, remove members (Admin only) |
| **Overdue Tracking** | Auto-detects overdue tasks and highlights them across the app |
| **Activity Log** | Real-time activity feed logged to the database |

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL
- **Auth:** JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Deployment:** Railway

---

## 📦 Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database

### 1. Clone the repo
```bash
git clone https://github.com/your-username/projectpilot.git
cd projectpilot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your database URL and JWT secret
```

**.env file:**
```
DATABASE_URL=postgresql://user:password@localhost:5432/projectpilot
JWT_SECRET=your_super_secret_key_here
PORT=3000
NODE_ENV=development
```

### 4. Set up the database
```bash
# Create database
createdb projectpilot

# Run schema
psql -d projectpilot -f db/schema.sql
```

### 5. Run the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open `http://localhost:3000`

---

## 🌐 Railway Deployment

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/projectpilot.git
git push -u origin main
```

### 2. Deploy on Railway
1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** → select `projectpilot`
3. Add a **PostgreSQL** service from the Railway dashboard
4. Add environment variables in Railway:
   - `DATABASE_URL` → copy from the PostgreSQL service (Railway sets this automatically)
   - `JWT_SECRET` → any long random string
   - `NODE_ENV` → `production`
5. Railway will auto-deploy. Run the schema in the Railway PostgreSQL console:
   ```sql
   -- paste contents of db/schema.sql
   ```

---

## 🔌 REST API Reference

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/register` | No | — | Register new user |
| POST | `/api/auth/login` | No | — | Login, get JWT token |
| GET | `/api/projects` | ✅ | Any | List all projects |
| POST | `/api/projects` | ✅ | Admin | Create project |
| PUT | `/api/projects/:id` | ✅ | Admin | Update project |
| DELETE | `/api/projects/:id` | ✅ | Admin | Delete project |
| GET | `/api/tasks` | ✅ | Any | List all tasks |
| POST | `/api/tasks` | ✅ | Any | Create task |
| PUT | `/api/tasks/:id` | ✅ | Admin/Assignee | Update task |
| PATCH | `/api/tasks/:id/status` | ✅ | Admin/Assignee | Quick status update |
| DELETE | `/api/tasks/:id` | ✅ | Admin | Delete task |
| GET | `/api/users` | ✅ | Any | List team members |
| PUT | `/api/users/:id/role` | ✅ | Admin | Toggle member role |
| DELETE | `/api/users/:id` | ✅ | Admin | Remove member |
| GET | `/api/activity` | ✅ | Any | Recent activity log |

---

## 👥 Demo Accounts

After seeding the database, you can log in with:

| Email | Password | Role |
|-------|----------|------|
| admin@pilot.com | admin123 | Admin |
| jane@pilot.com | pass123 | Member |

> **Note:** Create these via the signup form or seed script.

---

## 📁 Project Structure

```
projectpilot/
├── server.js          # Express entry point
├── package.json
├── railway.toml       # Railway deployment config
├── .env.example
├── db/
│   ├── schema.sql     # PostgreSQL tables
│   └── pool.js        # DB connection pool
├── middleware/
│   ├── auth.js        # JWT verification
│   └── rbac.js        # Admin-only guard
├── routes/
│   ├── auth.js        # Auth endpoints
│   ├── projects.js    # Projects CRUD
│   ├── tasks.js       # Tasks CRUD
│   └── users.js       # Users management
└── public/
    ├── index.html     # Frontend SPA
    └── app.js         # Frontend JS (API client)
```

---

## 🔐 Security Features

- Passwords hashed with **bcrypt** (salt rounds: 10)
- **JWT tokens** expire after 7 days
- **Server-side RBAC** — admin routes return 403 for non-admins even if called directly
- Task edit/delete restricted to admin, assignee, or creator
