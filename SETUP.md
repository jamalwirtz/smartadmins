# SSTG — Setup Guide
**Smart School Timetable Generator**

---

## How the app works

FastAPI serves both the API *and* the React frontend from one process.
There is no separate frontend service. No CORS issues. No VITE_API_URL.

```
Browser → https://smartadmin.onrender.com/dashboard
              │
              ▼
        FastAPI (uvicorn)
        ├── /auth/*        API routes
        ├── /teachers/*    API routes
        ├── /exams/*       API routes
        ├── /assets/*      React JS/CSS chunks (from frontend/dist/assets)
        └── /*             index.html → React Router takes over
```

---

## Local Development

### Step 1 — Backend

```bash
# From project root (SmartAdmin/)
python -m venv venv

# Activate
venv\Scripts\activate        # Windows
source venv/bin/activate     # Mac/Linux

# Install
pip install -r backend/requirements.txt

# Create .env in project root
SECRET_KEY=any-local-dev-key
DATABASE_URL=sqlite:///./sstg.db
SCHOOL_NAME=Greenfield Academy
ACADEMIC_YEAR=2025/2026
PERIODS_PER_DAY=8
SCHOOL_DAYS=Monday,Tuesday,Wednesday,Thursday,Friday

# Start backend
uvicorn main:app --reload
```

Backend: http://localhost:8000/docs

### Step 2 — Frontend (dev server with hot reload)

```bash
# Second terminal
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

The Vite dev server proxies `/api/*` → `localhost:8000` — no VITE_API_URL needed.

### Sign in
Go to http://localhost:5173 → `admin` / `admin123`

---

## Deploying to Render (Single Service)

### One-time setup

1. Push your code to GitHub
2. Go to https://dashboard.render.com → **New** → **Blueprint**
3. Connect your repo — Render reads `render.yaml` automatically
4. It creates **one web service** (`smartadmin`) and **one database** (`sstg-db`)
5. Wait for the build to finish (~3–5 minutes)
6. Visit your service URL — the app is live

### What render.yaml configures automatically

| Setting | Value |
|---|---|
| Build | `cd frontend && npm install && npm run build && pip install -r backend/requirements.txt` |
| Start | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Database | PostgreSQL auto-linked via `DATABASE_URL` |
| Secret key | Auto-generated |

**No manual environment variables needed** — render.yaml handles everything.

### If you already have a service (manual setup)

Go to your **web service** → **Settings**:

```
Root Directory:   .  (project root, not backend/)
Build Command:    cd frontend && npm install && npm run build && cd .. && pip install -r backend/requirements.txt
Start Command:    uvicorn main:app --host 0.0.0.0 --port $PORT
```

Environment variables:
```
SECRET_KEY      = (auto-generate or paste from: openssl rand -hex 32)
DATABASE_URL    = (Internal URL from your Render PostgreSQL database)
SCHOOL_NAME     = Greenfield Academy
ACADEMIC_YEAR   = 2025/2026
```

---

## Troubleshooting

### Build fails: `No 'script_location' key found`
Alembic is being called in the build command. Remove `alembic upgrade head` — tables
are created automatically on startup by `Base.metadata.create_all()`.

### Build fails: `npm: command not found`
Render needs Node.js. Add to environment variables: `NODE_VERSION = 20`

### App starts but shows blank page
The React build didn't complete. Check build logs for npm errors.
Make sure `frontend/dist/` exists after the build step.

### Sign-in fails: `Cannot reach the server`
The backend crashed on startup. Check logs for Python errors.
Most common cause: `DATABASE_URL` not set or incorrect format.

### `connection timeout expired` (PostgreSQL)
You're using the wrong DATABASE_URL. Use the **Internal URL** on Render
(the short hostname without `.oregon-postgres.render.com`).
The Internal URL only works when both services are in the same Render region.

### Port 8000 in use (local dev)
```bash
# Windows:
netstat -ano | findstr :8000
taskkill /PID <the_pid> /F

# Mac/Linux:
lsof -ti:8000 | xargs kill -9
```

### Reset demo data (local)
```bash
del sstg.db        # Windows
rm sstg.db         # Mac/Linux
uvicorn main:app --reload   # re-seeds automatically
```

---

## Demo credentials
- Username: `admin`
- Password: `admin123`

---

## API documentation
When running locally: http://localhost:8000/docs
