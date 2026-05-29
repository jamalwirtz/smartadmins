"""
SSTG – Database engine & session factory.

Python 3.14 note:
  psycopg2-binary is replaced by psycopg[binary] (psycopg3).
  psycopg3 uses the same postgresql:// URL scheme, BUT SQLAlchemy needs
  the driver specified as postgresql+psycopg:// (not postgresql+psycopg2://).
  This file auto-rewrites the URL so existing .env files keep working.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import get_settings

settings = get_settings()


def _fix_db_url(url: str) -> str:
    """
    Translate legacy psycopg2 URLs to psycopg3 driver notation.
    postgresql://...           → postgresql+psycopg://...
    postgresql+psycopg2://...  → postgresql+psycopg://...
    sqlite://...               → unchanged
    """
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        # SQLAlchemy needs an explicit driver for psycopg3
        return url.replace("postgresql://", "postgresql+psycopg://", 1)\
                  .replace("postgres://",   "postgresql+psycopg://", 1)
    return url


db_url = _fix_db_url(settings.DATABASE_URL)
is_sqlite = db_url.startswith("sqlite")

connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,          # detect stale connections
    echo=settings.DEBUG,
)

# SQLite WAL mode for better concurrent read performance
if is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a scoped DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
