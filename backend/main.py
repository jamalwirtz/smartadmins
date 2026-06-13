"""
SSTG – FastAPI Application Factory
Run:    uvicorn main:app --reload        (from backend/)
        python app.py                    (convenience shim)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

        # ── Class sections ────────────────────────────────────────────────
        for name, grade in [("7A","7"), ("7B","7"), ("8A","8"), ("8B","8")]:
            db.add(ClassSection(name=name, grade_level=grade))

        db.commit()
        print("[boot] Demo data seeded: admin/admin123 + 6 teachers + 9 subjects + 4 classes")
        # Seed default school settings if not present
        if not db.query(SchoolSettings).first():
            db.add(SchoolSettings(
                school_name="Greenfield Academy",
                academic_year="2025/2026",
                country_code="ZA",
            ))
            db.commit()

    except Exception as e:
        db.rollback()
        print(f"[boot] Seed warning: {e}")
    finally:
        db.close()

_ensure_demo_data()

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


# ── Serve React frontend (production) ─────────────────────────────────────────
# When deployed on Render as a single service, the React app is built into
# frontend/dist/ and FastAPI serves it directly — no separate static host needed.
_THIS_DIR  = _os.path.dirname(_os.path.abspath(__file__))
_DIST_DIR  = _os.path.join(_THIS_DIR, "..", "frontend", "dist")
_DIST_DIR  = _os.path.normpath(_DIST_DIR)

if _os.path.isdir(_DIST_DIR):
    # Mount the assets folder (JS/CSS chunks Vite generates)
    _assets = _os.path.join(_DIST_DIR, "assets")
    if _os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    # Mount any other static files at root level (favicon, logo, etc.)
    app.mount("/static", StaticFiles(directory=_DIST_DIR), name="static")

    # Catch-all: serve index.html for ALL non-API paths so React Router works
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        # Try the exact file first (handles favicon.ico, logo.png etc.)
        exact = _os.path.join(_DIST_DIR, full_path)
        if _os.path.isfile(exact):
            return FileResponse(exact)
        # Fall back to index.html — React Router handles the rest
        return FileResponse(_os.path.join(_DIST_DIR, "index.html"))

else:
    # Dev mode — no dist folder, just return API info at /
    @app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
    def root():
        return {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "note": "Frontend not built. Run: cd frontend && npm run build",
        }
