"""
SSTG — Exam resources: bulk fill supervisors and rooms
=======================================================
Adds the "fill in supervisors" workflow the exam setup was missing:

  POST /supervisors/from-teachers   — one click: every teacher becomes an invigilator
  POST /supervisors/import          — CSV / .xlsx upload
  GET  /supervisors/import/template — starter CSV (public: it is static text, and
                                      a plain <a href> cannot send the auth header)
  POST /rooms/import, GET /rooms/import/template — same for rooms

Columns (case-insensitive):
  Supervisors: name*, role (teacher|ra|external|admin), department, email, phone,
               max_sessions, availability (e.g. "Monday,Tuesday")
  Rooms:       name*, building, capacity, equipment
"""
from __future__ import annotations
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from security import require_admin
from models import User, Teacher, Supervisor, Room
from import_export import _read_rows, _get, _as_int

router = APIRouter(tags=["Exam Resources"])

ROLES = {"teacher", "ra", "external", "admin"}
DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}


def _csv_response(filename: str, headers: list, examples: list) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for ex in examples:
        w.writerow(ex)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _clean_days(raw) -> str | None:
    if not raw:
        return None
    parts = [p.strip().capitalize() for p in str(raw).replace(";", ",").split(",")]
    good = [p for p in parts if p.lower() in DAYS]
    return ",".join(good) or None


@router.post("/supervisors/from-teachers")
def supervisors_from_teachers(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Create an invigilator record for every teacher who is not one already."""
    existing = db.query(Supervisor).all()
    emails = {(s.email or "").strip().lower() for s in existing if s.email}
    names = {s.name.strip().lower() for s in existing}
    created = 0
    for t in db.query(Teacher).all():
        if (t.email and t.email.strip().lower() in emails) or t.name.strip().lower() in names:
            continue
        db.add(Supervisor(
            name=t.name[:80], role="teacher", email=t.email, phone=t.phone,
            availability=None,
            max_sessions=2 if t.is_part_time else 3,
        ))
        created += 1
    db.commit()
    return {"created": created,
            "message": f"Added {created} teacher(s) as supervisors" if created
                       else "All teachers are already supervisors"}


@router.get("/supervisors/import/template")
def supervisors_template():
    return _csv_response(
        "supervisors_import_template.csv",
        ["name", "role", "department", "email", "phone", "max_sessions", "availability"],
        [["Mr Brian Otieno", "teacher", "Languages", "brian@school.edu", "+254700000001", "3", "Monday,Tuesday,Thursday"],
         ["Ms Grace Akello", "external", "", "grace@example.com", "", "2", ""]],
    )


@router.post("/supervisors/import")
async def import_supervisors(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = _read_rows(file, await file.read())
    if not rows:
        raise HTTPException(400, "No data rows found — the file needs a header row and at least one supervisor")
    existing = db.query(Supervisor).all()
    names = {s.name.strip().lower() for s in existing}
    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        name = _get(row, "name", "supervisor", "full name")
        if not name or not str(name).strip():
            skipped += 1; errors.append(f"Row {i}: missing name — skipped"); continue
        name = str(name).strip()[:80]
        if name.lower() in names:
            skipped += 1; errors.append(f"Row {i}: '{name}' already exists — skipped"); continue
        role = str(_get(row, "role", default="teacher")).strip().lower()
        db.add(Supervisor(
            name=name,
            role=role if role in ROLES else "teacher",
            department=(str(_get(row, "department", default="") or "").strip() or None),
            email=(str(_get(row, "email", default="") or "").strip() or None),
            phone=(str(_get(row, "phone", default="") or "").strip() or None),
            max_sessions=_as_int(_get(row, "max_sessions", "max sessions"), 3),
            availability=_clean_days(_get(row, "availability", "available days")),
        ))
        names.add(name.lower())
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} supervisor(s)" + (f", skipped {skipped}" if skipped else "")}


@router.get("/rooms/import/template")
def rooms_template():
    return _csv_response(
        "rooms_import_template.csv",
        ["name", "building", "capacity", "equipment"],
        [["Main Hall", "Admin Block", "120", "stage"],
         ["Science Lab 1", "Science Block", "30", "lab bench,projector"]],
    )


@router.post("/rooms/import")
async def import_rooms(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = _read_rows(file, await file.read())
    if not rows:
        raise HTTPException(400, "No data rows found — the file needs a header row and at least one room")
    names = {r.name.strip().lower() for r in db.query(Room).filter(Room.is_active == True).all()}  # noqa: E712
    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        name = _get(row, "name", "room", "room name")
        if not name or not str(name).strip():
            skipped += 1; errors.append(f"Row {i}: missing name — skipped"); continue
        name = str(name).strip()[:80]
        if name.lower() in names:
            skipped += 1; errors.append(f"Row {i}: '{name}' already exists — skipped"); continue
        db.add(Room(
            name=name,
            building=(str(_get(row, "building", default="") or "").strip() or None),
            capacity=_as_int(_get(row, "capacity"), 30),
            equipment=(str(_get(row, "equipment", default="") or "").strip() or None),
        ))
        names.add(name.lower())
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} room(s)" + (f", skipped {skipped}" if skipped else "")}
