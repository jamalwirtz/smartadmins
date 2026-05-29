"""SSTG – Pytest fixtures shared across all test files."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import Base, get_db
from models import Teacher, Subject, TeacherSubject, ClassSection, User
from security import hash_password
from models import _uuid

# ── In-memory SQLite for tests ───────────────────────────────────────────────

TEST_DB = "sqlite:///:memory:"
test_engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_db


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    session = TestSession()
    yield session
    session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    r = client.post("/auth/register", json={
        "username": "admin", "email": "admin@test.com", "password": "secret"
    })
    return r.json()["access_token"]


@pytest.fixture
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def school_data(db):
    """Seed minimal realistic school: 2 teachers, 3 subjects, 2 classes."""
    t1 = Teacher(id=_uuid(), name="Alice Math", email="alice@t.com", max_weekly_hours=20)
    t2 = Teacher(id=_uuid(), name="Bob Science", email="bob@t.com", max_weekly_hours=20,
                 is_part_time=True, days_off="Wednesday")
    db.add_all([t1, t2])

    s1 = Subject(id=_uuid(), name="Mathematics", grade_level="7", weekly_periods=4, color_hex="#1565c0")
    s2 = Subject(id=_uuid(), name="English",     grade_level="7", weekly_periods=3, color_hex="#6a1b9a")
    s3 = Subject(id=_uuid(), name="Science",     grade_level="8", weekly_periods=4, color_hex="#2e7d32")
    db.add_all([s1, s2, s3])
    db.flush()

    db.add(TeacherSubject(teacher_id=t1.id, subject_id=s1.id))
    db.add(TeacherSubject(teacher_id=t1.id, subject_id=s2.id))
    db.add(TeacherSubject(teacher_id=t2.id, subject_id=s3.id))

    c1 = ClassSection(id=_uuid(), name="7A", grade_level="7")
    c2 = ClassSection(id=_uuid(), name="8B", grade_level="8")
    db.add_all([c1, c2])
    db.commit()

    return {"teachers": [t1, t2], "subjects": [s1, s2, s3], "classes": [c1, c2]}
