# TaskPilot 🚀

A full-stack **Project & Task Management** web app with role-based access control (Admin/Member).

🌐 **Live URL:** [https://taskpilot-ps77.onrender.com]
📦 **GitHub:** [https://github.com/ashutosh8950/TaskPilot]

---

## ✨ Features

- 🔐 **Authentication** — Signup/Login with JWT, bcrypt password hashing
- 👥 **Role-Based Access** — Admin can create/edit/delete projects & manage members; Members can view and manage tasks
- 📋 **Project Management** — Create, edit, delete projects with color coding & due dates
- ✅ **Task Management** — Create, assign, prioritize, and track tasks (Todo / In Progress / Done)
- 📊 **Dashboard** — Live stats: total projects, tasks, overdue count, progress overview
- 🗂️ **Kanban Board** — Visual task board per project
- 👤 **Team Management** — Admin can invite/remove members and assign roles
- 🔔 **Activity Feed** — Real-time log of all workspace actions
- ⚠️ **Overdue Detection** — Highlights tasks past their due date

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Deployment | Render |

---

## 🚀 Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL (or use Render's managed PostgreSQL)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/taskpilot.git
cd taskpilot

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# 4. Start the server
npm run dev        # development (with nodemon)
npm start          # production
```

Open `http://localhost:3000` in your browser.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@pilot.com | admin123 |
| Member | jane@pilot.com | pass123 |
| Member | bob@pilot.com | pass123 |

> **Note:** Demo accounts are only seeded when `NODE_ENV` is not `production`.

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |

### Projects
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/projects | All users |
| POST | /api/projects | Admin only |
| PUT | /api/projects/:id | Admin only |
| DELETE | /api/projects/:id | Admin only |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/tasks | All tasks (filter by ?projectId=) |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/:id | Update task |
| PATCH | /api/tasks/:id/status | Update status only |
| DELETE | /api/tasks/:id | Delete task |

### Members
| Method | Endpoint | Access |
|---|---|---|
| GET | /api/members | All users |
| POST | /api/members | Admin only |
| PUT | /api/members/:id/role | Admin only |
| DELETE | /api/members/:id | Admin only |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/health | Health check (DB connectivity) |

---

## 🌐 Deploy to Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → **Blueprint**
3. Connect your GitHub repository — Render will detect the `render.yaml` and auto-configure:
   - A **Web Service** (Node.js) running `node server.js`
   - A **PostgreSQL database** (`taskpilot-db`)
4. Environment variables are set automatically:
   - `DATABASE_URL` — auto-filled from the database
   - `JWT_SECRET` — auto-generated
   - `NODE_ENV=production`
5. Click **Apply** — Render builds, deploys, and starts the health check at `/api/health`

### Manual Deploy (without Blueprint)

1. Create a **PostgreSQL** database on Render
2. Create a **Web Service** → connect your repo
3. Set **Build Command:** `npm install`
4. Set **Start Command:** `node server.js`
5. Add environment variables: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`

---

## 📁 Project Structure

```
taskpilot/
├── server.js              # Express entry point
├── render.yaml            # Render deployment config
├── src/
│   ├── db.js              # PostgreSQL connection + schema init
│   ├── routes/
│   │   ├── auth.js        # Register, Login, Me
│   │   ├── projects.js    # Projects CRUD
│   │   ├── tasks.js       # Tasks CRUD
│   │   ├── members.js     # Team management
│   │   └── activities.js  # Activity feed
│   └── middleware/
│       ├── auth.js        # JWT verification
│       └── adminOnly.js   # Admin role guard
├── public/
│   └── index.html         # Frontend SPA
├── .env.example           # Environment variables template
└── package.json
```

---

## 👨‍💻 Built by Ashutosh Gupta

- 📧 guptaashutosh8950@gmail.com
- 💼 [LinkedIn](https://www.linkedin.com/in/im-ashutosh-gupta/)
- 🐙 [GitHub](https://github.com/ashutosh8950)
