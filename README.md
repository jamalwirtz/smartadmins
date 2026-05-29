# Smart School Timetable Generator (SSTG)

Full-stack automated timetabling system.
**Backend:** Python FastAPI + SQLAlchemy
**Frontend:** React + Vite
**Database:** PostgreSQL (production) / SQLite (local dev)

## Project Structure

```
sstg-project/
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app factory + router mounting
│   │   ├── config.py        Settings loaded from .env
│   │   ├── database.py      SQLAlchemy engine + session + Base
│   │   ├── models.py        All ORM table definitions
│   │   ├── api/             Route handlers (one file per domain)
│   │   │   ├── auth.py
│   │   │   ├── teachers.py
│   │   │   ├── subjects.py
│   │   │   ├── classes.py
│   │   │   ├── schedules.py
│   │   │   └── exports.py
│   │   ├── schemas/         Pydantic request/response models
│   │   │   └── all.py
│   │   ├── services/        Business logic
│   │   │   ├── scheduler.py  Constraint-based scheduling engine
│   │   │   ├── exporter.py   PDF generation (ReportLab)
│   │   │   └── email_service.py  SMTP email sender
│   │   └── core/
│   │       └── security.py  JWT auth + password hashing
│   ├── tests/
│   │   ├── conftest.py      Shared pytest fixtures
│   │   ├── test_auth_teachers.py
│   │   └── test_scheduler.py
│   ├── alembic/             Database migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── seed_demo.py         Demo data seeder
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx         React entry point
│   │   ├── App.jsx          Router + sidebar layout
│   │   ├── index.css        Global design system styles
│   │   ├── api/client.js    Axios wrapper + all API calls
│   │   ├── context/AuthContext.jsx
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Teachers.jsx   CRUD + subject assignment + availability
│   │       ├── Subjects.jsx   CRUD grouped by grade
│   │       ├── Classes.jsx    CRUD
│   │       ├── Timetable.jsx  Drafts, grid view, lock/unlock, reshuffle, PDF
│   │       └── TeacherView.jsx  Per-teacher weekly schedule + email
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── docker-compose.yml       Full stack (postgres + backend + frontend)
├── nginx.conf               Production reverse proxy config
└── env.example              Environment variable template
```

## Do You Need Docker?

**Short answer: No. You can run the entire project with just a Python venv and Node.js.**

Docker is provided as a convenience for teams and deployment, but this project is designed to work perfectly solo without it. Here's the honest comparison:

| | venv (local dev) | Docker Compose |
|---|---|---|
| Setup speed | Fast (3 commands) | Slower (image builds) |
| Requires Docker installed | ❌ No | ✅ Yes |
| Uses SQLite (zero-config DB) | ✅ Yes | ❌ No (uses Postgres) |
| Best for | Solo dev, learning, testing | Teams, staging, production |
| Restart on code change | ✅ Auto with `--reload` | Needs volume mounts |
| Isolates Python versions | ✅ Yes (venv) | ✅ Yes (container) |

**Recommendation:** Start with the venv approach below. Only add Docker when you're ready to deploy or share with a team.

---

## Getting Started

### ✅ Option A — venv (Recommended for solo dev, no Docker needed)

**Step 1 — Backend**
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install all dependencies
pip install -r requirements.txt

# Set up environment
cp ../env.example .env
# Open .env and set SECRET_KEY to any long random string
# Everything else has sensible defaults (SQLite is used automatically)

# Seed demo data (optional but recommended)
python seed_demo.py

# Start the API server
uvicorn app.main:app --reload
```
API running at: http://127.0.0.1:8000
Interactive docs: http://127.0.0.1:8000/docs

**Step 2 — Frontend** (in a new terminal)
```bash
cd frontend

npm install

# Tell the frontend where the backend lives
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
```
UI running at: http://localhost:5173

**Login:** `admin` / `admin123`

That's it. No Docker, no Postgres, no extra services — SQLite handles the database automatically.

---

### Option B — Docker Compose (team/staging use)

```bash
cp env.example .env         # set SECRET_KEY at minimum
docker-compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/docs

Uses PostgreSQL automatically via the `db` service.

---

### Option C — Production deployment

```bash
# Backend
cd backend
source venv/bin/activate
# Set DATABASE_URL to PostgreSQL in .env
alembic upgrade head                                      # run migrations
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend — build static files then serve via nginx
cd frontend && npm run build
# Copy dist/ to nginx root and use nginx.conf provided
```

## Running Tests

```bash
cd backend
pip install pytest pytest-cov
pytest tests/ -v
pytest tests/ -v --cov=app --cov-report=term-missing
```

## Database Migrations (Alembic)

```bash
cd backend

# Auto-generate a migration after model changes
alembic revision --autogenerate -m "add_room_field"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Create admin account |
| POST | /auth/login | Get JWT token |
| GET | /auth/me | Current user info |
| GET/POST | /teachers | List / create teachers |
| GET/PUT/DELETE | /teachers/{id} | Get / update / delete |
| POST | /teachers/{id}/subjects | Assign subjects to teacher |
| GET | /teachers/{id}/schedule?draft_id= | Teacher weekly view |
| GET/POST | /subjects | List / create subjects |
| GET/POST | /classes | List / create class sections |
| POST | /schedule/generate | Generate N timetable drafts |
| POST | /schedule/reshuffle | Reshuffle (keeps locked slots) |
| GET | /schedule/drafts | List all drafts |
| GET | /schedule/drafts/{id} | Full slot grid |
| POST | /schedule/lock | Lock/unlock a slot |
| PUT | /schedule/drafts/{id}/activate | Set as active timetable |
| DELETE | /schedule/drafts/{id} | Delete a draft |
| GET | /schedule/drafts/{id}/validate | Check for conflicts |
| GET | /export/draft/{id}/pdf | Download full timetable PDF |
| GET | /export/teacher/{id}/pdf?draft_id= | Download teacher PDF |
| POST | /export/email/teacher | Email schedule to teacher |

## Teacher Availability Formats

**days_off** (comma-separated day names):
```
Monday,Friday
```

**unavailable_slots** (JSON, day → period numbers):
```json
{"Monday": [1, 2], "Wednesday": [7, 8]}
```

## Scheduling Engine

The engine uses seeded randomised backtracking:

**Hard constraints** (never broken):
- No teacher double-booking
- No class double-booking
- Teacher days-off respected
- Teacher unavailable periods respected
- Max weekly hours not exceeded
- Locked slots never moved

**Soft constraints** (scored/optimised):
- Same subject not clustered on same day
- Subjects spread across the week
- Teacher load balanced across days

Three seeds [101, 202, 303] produce three structurally different valid drafts.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| DATABASE_URL | sqlite:///./sstg.db | DB connection (use postgres in prod) |
| SECRET_KEY | — | JWT signing key (required) |
| SCHOOL_NAME | Greenfield Academy | PDF header |
| ACADEMIC_YEAR | 2024/2025 | PDF header |
| PERIODS_PER_DAY | 8 | Periods per school day |
| SCHOOL_DAYS | Mon–Fri | Comma-separated working days |
| SMTP_HOST | smtp.gmail.com | Email server |
| SMTP_USER | — | SMTP login |
| SMTP_PASSWORD | — | SMTP password (use app password for Gmail) |
| CORS_ORIGINS | localhost:5173 | Allowed frontend origins |

## Flask vs FastAPI — Do You Need to Switch?

**Short answer: You don't need Flask. FastAPI is strictly better for this project.**

If you're more comfortable with Flask, here's an honest breakdown:

| Feature | FastAPI (current) | Flask equivalent |
|---|---|---|
| Auto API docs (/docs) | ✅ Built-in (Swagger + ReDoc) | ❌ Need flask-swagger manually |
| Request validation | ✅ Pydantic built-in | ❌ Need marshmallow or WTForms |
| JWT auth | ✅ Works cleanly with OAuth2 helpers | ⚠️ Flask-JWT-Extended addon |
| Async support | ✅ Native | ⚠️ Flask 2+ supports it but awkward |
| Type hints / IDE support | ✅ Excellent | ⚠️ Partial |
| ORM (SQLAlchemy) | ✅ SQLAlchemy works identically | ✅ Flask-SQLAlchemy (same thing + thin wrapper) |
| Learning curve | Low (similar to Flask) | Low |
| Production performance | Higher | Lower |

**The only reason to use Flask instead would be if your team already has a Flask codebase you're extending.** For a greenfield project like this, FastAPI is the better choice.

### If you want to use Flask-SQLAlchemy style models

The models in `app/models.py` already use plain SQLAlchemy — which is exactly what Flask-SQLAlchemy uses under the hood. The only difference with Flask-SQLAlchemy is the `db = SQLAlchemy(app)` shortcut. You don't need that here because we have `database.py` doing the same thing explicitly.

If you ever migrate this to Flask, your models require zero changes — just swap `from app.database import Base` for `db = SQLAlchemy(flask_app)` and change `class Base` to `db.Model`.

---

## Suggested Phase 2 Enhancements

- Drag-and-drop slot editing in the timetable grid
- Room / lab scheduling layer
- Substitute teacher quick-assign
- CSV/Excel bulk import for teachers
- Google Calendar sync
- Conflict heat-map visualisation
- Teacher self-service login (read-only portal)
- SMS/WhatsApp notifications (Twilio)
- Multi-school / multi-campus support
