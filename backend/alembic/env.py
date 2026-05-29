import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Alembic environment – auto-generates migrations from SQLAlchemy models."""
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from config import get_settings
from database import Base, _fix_db_url
import models  # noqa: register all models

config = context.config
settings = get_settings()

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── CRITICAL: translate postgresql:// → postgresql+psycopg:// ────────────────
# database.py's _fix_db_url handles this for the app itself, but alembic's
# engine_from_config reads from the INI config section which gets the raw URL.
# We must rewrite it here too, otherwise alembic tries psycopg2 (not installed).
fixed_url = _fix_db_url(settings.DATABASE_URL)
config.set_main_option("sqlalchemy.url", fixed_url)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
