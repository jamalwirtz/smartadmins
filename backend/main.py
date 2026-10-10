"""
SSTG – FastAPI Application Factory
Run:    uvicorn main:app --reload        (from backend/)
        python app.py                    (convenience shim)
"""
import logging
import re
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os as _os

from config import get_settings
from database import Base, engine
import models  # noqa: registers all ORM models
import personal_timetable  # noqa: registers PersonalTimetable/PersonalEvent models
import billing             # noqa: registers Subscription model

import auth, teachers, subjects, classes, schedules, exports, exams, templates_api, ai_scheduler, holidays, school_settings, allocations, education_systems, rooms, supervisors, import_export, exam_layouts, timetable_layouts
import ws_routes as websockets
from security import get_current_user

logger = logging.getLogger(__name__)
settings = get_settings()

# Create all tables on startup (safe to call repeatedly — skips existing tables)
Base.metadata.create_all(bind=engine)

# HARDENING: a wildcard CORS origin is a common accidental production
# footgun — it's fine for a demo/public API with no cookies, but worth
# surfacing loudly in logs so it's a deliberate choice, not an oversight.
if settings.cors_origins_list == ["*"]:
    logger.warning(
        "CORS_ORIGINS is '*' — any website can call this API from a "
        "browser. Fine for local dev/demo; set specific origins "
        "(e.g. your deployed frontend URL) before going to production."
    )

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
_MIGRATIONS = [
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
    # Curriculum-aware onboarding
    "ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_code VARCHAR(30)",
    "ALTER TABLE subjects ADD COLUMN IF NOT EXISTS education_system_id VARCHAR(36)",
    "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS education_system_id VARCHAR(36)",
    "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE",
    # Multi-template exam editor
    "ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS layout_template_id VARCHAR(36)",
    # Curriculum-aware timetable editor
    "ALTER TABLE timetable_drafts ADD COLUMN IF NOT EXISTS layout_template_id VARCHAR(36)",
    # Timetable-layout gallery presentation fields
    "ALTER TABLE timetable_layout_templates ADD COLUMN IF NOT EXISTS description VARCHAR(300)",
    "ALTER TABLE timetable_layout_templates ADD COLUMN IF NOT EXISTS icon VARCHAR(8)",
    "ALTER TABLE timetable_layout_templates ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7)",
    # NEW: billing — Subscription status/cycle columns in case an older row
    # exists without them (table itself is created fresh by create_all, but
    # this keeps the pattern consistent if the model gains fields later)
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'",
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(10) DEFAULT 'monthly'",
]

_ALTER_RE = re.compile(
    r"ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+) (.+)$", re.IGNORECASE
)


def _sqlite_column_exists(db, table: str, column: str) -> bool:
    from sqlalchemy import text
    try:
        rows = db.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == column for r in rows)
    except Exception:
        return True


def _run_migrations():
    """
    Idempotent ALTER TABLE runner — dialect-aware (see note below).

    On PostgreSQL, `ADD COLUMN IF NOT EXISTS` is used directly. On SQLite,
    which doesn't support that syntax, each migration is parsed into
    (table, column, coltype); PRAGMA table_info is checked first and a
    plain `ALTER TABLE ... ADD COLUMN ...` runs only when the column is
    actually missing.
    """
    from sqlalchemy import text
    from database import SessionLocal, db_url
    db = SessionLocal()
    is_pg = 'postgresql' in db_url
    try:
        for sql in _MIGRATIONS:
            if is_pg:
                try:
                    db.execute(text(sql))
                except Exception:
                    pass  # column may already exist
            else:
                m = _ALTER_RE.match(sql)
                if not m:
                    continue
                table, column, coltype = m.groups()
                if not _sqlite_column_exists(db, table, column):
                    try:
                        db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                    except Exception:
                        pass
        db.commit()
        print(f"[boot] DB migrations applied ✅ ({'postgres' if is_pg else 'sqlite'})")
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
        "real-time WebSocket updates, PDF export & email delivery. Also "
        "includes a secondary personal timetable module and plan-based "
        "pricing for home/office and school users."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
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
app.include_router(import_export.router,     prefix="",  tags=["Import/Export"])
app.include_router(exam_layouts.router,      prefix="",  tags=["Exam Layout Templates"])
app.include_router(timetable_layouts.router, prefix="",  tags=["Timetable Layout Templates"])
app.include_router(personal_timetable.router,prefix="",  tags=["Personal Timetables"])
app.include_router(billing.router,           prefix="",  tags=["Billing & Plans"])
app.include_router(websockets.router, tags=["WebSockets"])


@app.api_route("/health", methods=["GET", "HEAD"], tags=["Health"])
def health():
    return {"status": "ok"}


@app.api_route("/ping", methods=["GET", "HEAD"], tags=["Health"])
def ping():
    """Ultra-lightweight keepalive — use with UptimeRobot to prevent cold starts."""
    return "pong"


@app.get("/debug/status", tags=["Health"])
def debug_status(_user=Depends(get_current_user)):
    """
    HARDENING: this endpoint used to have no auth at all — anyone who found
    the URL could see the Python version, whether the database is reachable,
    the total user count, and whether an 'admin' account exists (useful
    recon for a credential-stuffing attempt against the known demo admin
    password). It now requires a valid logged-in token, same as any other
    account-scoped endpoint — any authenticated user can still use it to
    sanity-check their own deployment, but it's no longer public recon.
    """
    import sys
    from database import db_url, is_sqlite
    from sqlalchemy import text

    db_ok, user_count, admin_exists = False, 0, False
    db_error = None
    try:
        from database import SessionLocal
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        from models import User
        user_count  = db.query(User).count()
        admin_exists = db.query(User).filter(User.username == "admin").first() is not None
        db.close()
        db_ok = True
    except Exception as e:
        db_error = str(e)

    return {
        "status":       "running",
        "python":       sys.version,
        "database":     "sqlite" if is_sqlite else "postgresql",
        "db_connected": db_ok,
        "db_error":     db_error,
        "users":        user_count,
        "admin_exists": admin_exists,
    }


# ── Serve React frontend (production) ─────────────────────────────────────────
_THIS_DIR  = _os.path.dirname(_os.path.abspath(__file__))
_DIST_DIR  = _os.path.join(_THIS_DIR, "..", "frontend", "dist")
_DIST_DIR  = _os.path.normpath(_DIST_DIR)

if _os.path.isdir(_DIST_DIR):

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if not full_path:
            return FileResponse(_os.path.join(_DIST_DIR, "index.html"))

        exact = _os.path.join(_DIST_DIR, full_path)
        if _os.path.isfile(exact):
            return FileResponse(exact)

        return FileResponse(_os.path.join(_DIST_DIR, "index.html"))

else:
    @app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
    def root():
        return {
            "app": getattr(settings, "APP_NAME", "SSTG"),
            "version": getattr(settings, "APP_VERSION", "1.0"),
            "docs": "/docs",
            "note": "Frontend not built yet. Run: npm --prefix frontend run build",
        }
