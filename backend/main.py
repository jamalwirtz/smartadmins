"""
SSTG – FastAPI Application Factory
Run:    uvicorn main:app --reload        (from backend/)
        python app.py                    (convenience shim)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os as _os

from config import get_settings
from database import Base, engine
import models  # noqa: registers all ORM models

import auth, teachers, subjects, classes, schedules, exports, exams, templates_api, ai_scheduler, holidays, school_settings, allocations, education_systems, rooms, supervisors
import ws_routes as websockets

settings = get_settings()

# Create all tables on startup (safe to call repeatedly — skips existing tables)
Base.metadata.create_all(bind=engine)

# ── Auto-seed demo data on first boot ────────────────────────────────────────
def _ensure_demo_data():
    """
    On the very first boot (empty DB), seed:
      - admin user  (admin / admin123)
      - 6 demo teachers
      - 9 demo subjects across Grades 7 & 8
      - 4 class sections (7A, 7B, 8A, 8B)
    Safe to call every startup — skips if any user already exists.
    """
    from database import SessionLocal
    from models import User, Teacher, Subject, TeacherSubject, ClassSection, SchoolSettings
    from security import hash_password

    db = SessionLocal()
    try:
        # Already seeded — skip
        if db.query(User).first():
            return

        # ── Admin user ────────────────────────────────────────────────────
        admin = User(username="admin", email="admin@school.demo",
                     hashed_password=hash_password("admin123"), is_admin=True)
        db.add(admin)

        # ── Teachers ──────────────────────────────────────────────────────
        def mk_teacher(name, email, **kw):
            t = Teacher(name=name, email=email, **kw)
            db.add(t); db.flush(); return t

        alice  = mk_teacher("Mrs Alice Kamau",    "alice@s.demo",  max_weekly_hours=25)
        brian  = mk_teacher("Mr Brian Otieno",    "brian@s.demo",  max_weekly_hours=20,
                             is_part_time=True, days_off="Friday")
        carol  = mk_teacher("Ms Carol Wanjiku",   "carol@s.demo",  max_weekly_hours=30)
        david  = mk_teacher("Mr David Mwangi",    "david@s.demo",  max_weekly_hours=28)
        esther = mk_teacher("Mrs Esther Achieng", "esther@s.demo", max_weekly_hours=25,
                             days_off="Wednesday")
        felix  = mk_teacher("Mr Felix Oduya",     "felix@s.demo",  max_weekly_hours=30)

        # ── Subjects ──────────────────────────────────────────────────────
        def mk_subj(name, grade, periods, color):
            s = Subject(name=name, grade_level=grade, weekly_periods=periods, color_hex=color)
            db.add(s); db.flush(); return s

        math7 = mk_subj("Mathematics", "7", 5, "#1565c0")
        eng7  = mk_subj("English",     "7", 4, "#6a1b9a")
        sci7  = mk_subj("Science",     "7", 4, "#2e7d32")
        hist7 = mk_subj("History",     "7", 3, "#bf360c")
        math8 = mk_subj("Mathematics", "8", 5, "#1565c0")
        eng8  = mk_subj("English",     "8", 4, "#6a1b9a")
        bio8  = mk_subj("Biology",     "8", 4, "#558b2f")
        phy8  = mk_subj("Physics",     "8", 3, "#0277bd")
        chem8 = mk_subj("Chemistry",   "8", 3, "#e65100")

        # ── Teacher ↔ Subject assignments ────────────────────────────────
        def link(teacher, subject):
            db.add(TeacherSubject(teacher_id=teacher.id, subject_id=subject.id))

        link(alice,  math7); link(alice,  math8)
        link(brian,  eng7);  link(brian,  eng8)
        link(carol,  sci7);  link(carol,  bio8)
        link(david,  hist7); link(david,  phy8)
        link(esther, math7); link(esther, chem8)
        link(felix,  sci7);  link(felix,  phy8); link(felix, chem8)

        # Commit admin + teachers + subjects FIRST (critical path)
        db.commit()
        print("[boot] admin/teachers/subjects seeded ✅")

        # Class sections in a SEPARATE transaction (non-critical)
        # Isolated so schema-mismatch errors don't roll back the admin user
        try:
            for name, grade in [("7A","7"), ("7B","7"), ("8A","8"), ("8B","8")]:
                db.add(ClassSection(name=name, grade_level=grade))
            db.commit()
        except Exception:
            db.rollback()
            print("[boot] Class seed skipped — schema migration will handle this")

        # School settings (separate transaction)
        try:
            if not db.query(SchoolSettings).first():
                db.add(SchoolSettings(
                    school_name="Greenfield Academy",
                    academic_year="2025/2026",
                    country_code="ZA",
                ))
                db.commit()
        except Exception:
            db.rollback()

    except Exception as e:
        db.rollback()
        print(f"[boot] Seed warning: {e}")
    finally:
        db.close()

_ensure_demo_data()

# ── Auto-migrate: add any new columns to existing tables ─────────────────────
def _run_migrations():
    """
    Safe ALTER TABLE statements — each is idempotent (IF NOT EXISTS).
    Handles schema changes without Alembic for simple column additions.
    """
    from sqlalchemy import text
    from database import SessionLocal
    db = SessionLocal()
    migrations = [
        # ClassSection new columns
        "ALTER TABLE class_sections ADD COLUMN IF NOT EXISTS stream VARCHAR(40)",
        "ALTER TABLE class_sections ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 40",
        "ALTER TABLE class_sections ADD COLUMN IF NOT EXISTS education_system_id VARCHAR(36)",
        # SchoolSettings new columns
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS badge_position VARCHAR(20) DEFAULT 'top-left'",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_motto VARCHAR(200)",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_email VARCHAR(120)",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_phone VARCHAR(40)",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_address VARCHAR(300)",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS timetable_orientation VARCHAR(12) DEFAULT 'horizontal'",
        # ExamSlot new column
        "ALTER TABLE exam_slots ADD COLUMN IF NOT EXISTS room_id VARCHAR(36)",
        # TimetableSlot new columns for special events
        "ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS slot_type VARCHAR(30) DEFAULT 'lesson'",
        "ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS event_label VARCHAR(80)",
        "ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS event_color VARCHAR(7)",
        # Teacher new columns
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS initials VARCHAR(10)",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS short_name VARCHAR(40)",
        "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS phone VARCHAR(40)",
        # SchoolSettings name format + exam toggles
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS teacher_name_format VARCHAR(20) DEFAULT 'full_name'",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS exam_include_supervisors BOOLEAN DEFAULT TRUE",
        "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS exam_include_rooms BOOLEAN DEFAULT TRUE",
    ]
    try:
        from database import db_url
        is_pg = 'postgresql' in db_url
        if is_pg:  # Only run on PostgreSQL — SQLite uses create_all
            for sql in migrations:
                try:
                    db.execute(text(sql))
                except Exception:
                    pass  # Column may already exist
            db.commit()
            print("[boot] DB migrations applied ✅")
    except Exception as e:
        print(f"[boot] Migration note: {e}")
    finally:
        db.close()

_run_migrations()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Automated school timetable generator — constraint-based scheduling, "
        "multi-draft generation, static slot locking, drag-and-drop editing, "
        "real-time WebSocket updates, PDF export & email delivery."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# IMPORTANT: allow_credentials=True is ILLEGAL when allow_origins=["*"].
# Starlette raises a ValueError and ALL requests are blocked.
# Rule: wildcard origin → no credentials. Specific origins → credentials OK.
_origins = settings.cors_origins_list
_wildcard = _origins == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=not _wildcard,   # False when *, True when specific origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/auth",     tags=["Authentication"])
app.include_router(teachers.router,   prefix="/teachers", tags=["Teachers"])
app.include_router(subjects.router,   prefix="/subjects", tags=["Subjects"])
app.include_router(classes.router,    prefix="/classes",  tags=["Classes"])
app.include_router(schedules.router,  prefix="/schedule", tags=["Schedule"])
app.include_router(exports.router,    prefix="/export",   tags=["Export & Email"])
app.include_router(exams.router,         prefix="",          tags=["Exams"])
app.include_router(templates_api.router, prefix="",          tags=["Templates"])
app.include_router(ai_scheduler.router,  prefix="",          tags=["AI Assistant"])
app.include_router(holidays.router,         prefix="",          tags=["Holidays"])
app.include_router(school_settings.router,  prefix="",          tags=["School Settings"])
app.include_router(allocations.router,       prefix="",  tags=["Allocations"])
app.include_router(education_systems.router, prefix="",  tags=["Education Systems"])
app.include_router(rooms.router,             prefix="",  tags=["Rooms"])
app.include_router(supervisors.router,       prefix="",  tags=["Supervisors"])
app.include_router(websockets.router, tags=["WebSockets"])


@app.api_route("/health", methods=["GET", "HEAD"], tags=["Health"])
def health():
    return {"status": "ok"}


@app.api_route("/ping", methods=["GET", "HEAD"], tags=["Health"])
def ping():
    """
    Ultra-lightweight keepalive endpoint.
    Pin this URL in UptimeRobot (free) to ping every 5 minutes
    and prevent Render free-tier cold starts.
    https://uptimerobot.com — add monitor → HTTP(s) → your-app.onrender.com/ping
    """
    return "pong"


# ── Serve React frontend (production) ─────────────────────────────────────────
# When deployed on Render as a single service, the React app is built into
# frontend/dist/ and FastAPI serves it directly — no separate static host needed.
_THIS_DIR  = _os.path.dirname(_os.path.abspath(__file__))
_DIST_DIR  = _os.path.join(_THIS_DIR, "..", "frontend", "dist")
_DIST_DIR  = _os.path.normpath(_DIST_DIR)

# ── Serve React SPA (production) ──────────────────────────────────────────────
# IMPORTANT: We do NOT use app.mount("/static") because that catches ALL paths
# including /dashboard, /login etc. and returns 404 instead of index.html.
# Instead we use a single catch-all route that:
#   1. Serves exact files from dist/ (JS chunks, CSS, images, favicon)
#   2. Falls back to index.html for everything else (React Router takes over)

if _os.path.isdir(_DIST_DIR):

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        # Empty path → serve index.html (root URL)
        if not full_path:
            return FileResponse(_os.path.join(_DIST_DIR, "index.html"))

        # Check for exact file match first (assets/index-xxx.js, favicon.png, logo.png…)
        exact = _os.path.join(_DIST_DIR, full_path)
        if _os.path.isfile(exact):
            return FileResponse(exact)

        # assets/ subfolder (Vite puts hashed JS/CSS here)
        # path already resolved above via exact check

        # SPA fallback — React Router handles /dashboard, /login, etc.
        return FileResponse(_os.path.join(_DIST_DIR, "index.html"))

else:
    # Dev mode only — no dist folder present
    @app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
    def root():
        return {
            "app": getattr(settings, "APP_NAME", "SSTG"),
            "version": getattr(settings, "APP_VERSION", "1.0"),
            "docs": "/docs",
            "note": "Frontend not built yet. Run: npm --prefix frontend run build",
        }
