"""SSTG Tests – Auth + Teachers."""
import pytest
from models import Teacher, TeacherSubject


# ── Auth ─────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_register(self, client):
        r = client.post("/auth/register", json={"username": "u", "email": "u@t.com", "password": "pw"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_duplicate_username(self, client):
        client.post("/auth/register", json={"username": "dup", "email": "a@t.com", "password": "x"})
        r = client.post("/auth/register", json={"username": "dup", "email": "b@t.com", "password": "x"})
        assert r.status_code == 400

    def test_login(self, client):
        client.post("/auth/register", json={"username": "u", "email": "u@t.com", "password": "pw"})
        r = client.post("/auth/login", data={"username": "u", "password": "pw"})
        assert r.status_code == 200

    def test_bad_password(self, client):
        client.post("/auth/register", json={"username": "u", "email": "u@t.com", "password": "correct"})
        r = client.post("/auth/login", data={"username": "u", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, client, auth):
        r = client.get("/auth/me", headers=auth)
        assert r.json()["username"] == "admin"

    def test_protected_without_token(self, client):
        assert client.get("/teachers").status_code == 401


# ── Teachers ─────────────────────────────────────────────────────────────────

class TestTeachers:
    def test_create(self, client, auth):
        r = client.post("/teachers", json={"name": "Mrs Smith", "max_weekly_hours": 25}, headers=auth)
        assert r.status_code == 201

    def test_list(self, client, auth, school_data):
        r = client.get("/teachers", headers=auth)
        assert len(r.json()) == 2

    def test_update(self, client, auth, school_data):
        tid = school_data["teachers"][0].id
        r = client.put(f"/teachers/{tid}", json={"max_weekly_hours": 35}, headers=auth)
        assert r.status_code == 200

    def test_delete(self, client, auth, school_data):
        tid = school_data["teachers"][0].id
        client.delete(f"/teachers/{tid}", headers=auth)
        assert client.get(f"/teachers/{tid}", headers=auth).status_code == 404

    def test_assign_subjects(self, client, auth, school_data):
        tid = school_data["teachers"][0].id
        sid = school_data["subjects"][0].id
        r = client.post(f"/teachers/{tid}/subjects", json={"subject_ids": [sid]}, headers=auth)
        assert r.status_code == 200

    def test_days_off_property(self, school_data):
        t = school_data["teachers"][1]  # Bob has days_off="Wednesday"
        assert "Wednesday" in t.days_off_list

    def test_schedule_view(self, client, auth, school_data):
        tid = school_data["teachers"][0].id
        drafts = client.post("/schedule/generate", json={"draft_count": 1}, headers=auth).json()
        did = drafts[0]["id"]
        r = client.get(f"/teachers/{tid}/schedule?draft_id={did}", headers=auth)
        assert r.status_code == 200
        assert "schedule" in r.json()
