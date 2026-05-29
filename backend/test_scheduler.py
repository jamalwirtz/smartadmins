"""SSTG Tests – Scheduling Engine."""
import pytest
from models import TimetableSlot
from scheduler import SchedulingEngine


class TestScheduler:

    def test_generates_correct_count(self, db, school_data):
        drafts = SchedulingEngine(db).generate_drafts(count=3)
        assert len(drafts) == 3

    def test_draft_names_include_seed(self, db, school_data):
        drafts = SchedulingEngine(db).generate_drafts(count=2, seeds=[101, 999])
        names = " ".join(d.name for d in drafts)
        assert "101" in names
        assert "999" in names

    def test_no_teacher_double_booking(self, db, school_data):
        drafts = SchedulingEngine(db).generate_drafts(count=1)
        result = SchedulingEngine(db).validate(drafts[0].id)
        t_errors = [e for e in result["errors"] if "Teacher double" in e]
        assert len(t_errors) == 0, t_errors

    def test_no_class_double_booking(self, db, school_data):
        drafts = SchedulingEngine(db).generate_drafts(count=1)
        result = SchedulingEngine(db).validate(drafts[0].id)
        c_errors = [e for e in result["errors"] if "Class double" in e]
        assert len(c_errors) == 0, c_errors

    def test_days_off_respected(self, db, school_data):
        bob = school_data["teachers"][1]  # days_off="Wednesday"
        drafts = SchedulingEngine(db).generate_drafts(count=1)
        wednesday_slots = (
            db.query(TimetableSlot)
            .filter(
                TimetableSlot.draft_id == drafts[0].id,
                TimetableSlot.teacher_id == bob.id,
                TimetableSlot.day == "Wednesday",
            )
            .all()
        )
        assert len(wednesday_slots) == 0

    def test_locked_slot_survives_reshuffle(self, db, school_data):
        engine = SchedulingEngine(db)
        drafts = engine.generate_drafts(count=1)
        slot = db.query(TimetableSlot).filter(TimetableSlot.draft_id == drafts[0].id).first()
        if slot:
            slot.is_locked = True
            slot_id = slot.id
            db.commit()
            engine.reshuffle(drafts[0].id, keep_locked=True)
            assert db.get(TimetableSlot, slot_id) is not None

    def test_validate_returns_valid(self, db, school_data):
        drafts = SchedulingEngine(db).generate_drafts(count=1)
        result = SchedulingEngine(db).validate(drafts[0].id)
        assert result["valid"] is True

    def test_empty_school_no_crash(self, db):
        drafts = SchedulingEngine(db).generate_drafts(count=1)
        assert len(drafts[0].slots) == 0

    def test_different_seeds_vary(self, db, school_data):
        engine = SchedulingEngine(db)
        d1, d2 = engine.generate_drafts(count=2, seeds=[1, 9999])
        assert len(d1.slots) > 0
        assert len(d2.slots) > 0

    def test_api_generate(self, client, auth, school_data):
        r = client.post("/schedule/generate", json={"draft_count": 3}, headers=auth)
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_api_validate(self, client, auth, school_data):
        drafts = client.post("/schedule/generate", json={"draft_count": 1}, headers=auth).json()
        r = client.get(f"/schedule/drafts/{drafts[0]['id']}/validate", headers=auth)
        assert r.json()["valid"] is True

    def test_api_lock_slot(self, client, auth, school_data):
        did = client.post("/schedule/generate", json={"draft_count": 1}, headers=auth).json()[0]["id"]
        draft = client.get(f"/schedule/drafts/{did}", headers=auth).json()
        if draft["slots"]:
            sid = draft["slots"][0]["id"]
            r = client.post("/schedule/lock", json={"slot_id": sid, "locked": True}, headers=auth)
            assert r.json()["is_locked"] is True

    def test_api_reshuffle(self, client, auth, school_data):
        did = client.post("/schedule/generate", json={"draft_count": 1}, headers=auth).json()[0]["id"]
        r = client.post("/schedule/reshuffle", json={"draft_id": did, "keep_locked": True}, headers=auth)
        assert r.status_code == 200

    def test_api_activate(self, client, auth, school_data):
        did = client.post("/schedule/generate", json={"draft_count": 1}, headers=auth).json()[0]["id"]
        r = client.put(f"/schedule/drafts/{did}/activate", headers=auth)
        assert r.status_code == 200
