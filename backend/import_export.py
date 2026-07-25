"""
SSTG — Bulk Import (CSV/Excel)
================================
Lets admins import Teachers, Subjects, and Classes in bulk from a CSV or
Excel (.xlsx) file instead of typing each one in by hand — matching the
same fields the manual "Add" forms use on each Setup page.

Expected columns (case-insensitive; extra/unknown columns are ignored):

  Teachers:  name*, email, max_weekly_hours, is_part_time, days_off
  Subjects:  name*, grade_level*, weekly_periods, allows_double_period,
             is_static_eligible, color_hex
  Classes:   name*, grade_level*, stream, capacity, max_subjects_per_day

  (* = required — rows missing a required field are skipped, not fatal;
  the response reports exactly which rows were skipped and why so nothing
  fails silently.)

Blank starter templates are available at:
  GET /teachers/import/template
  GET /subjects/import/template
  GET /classes/import/template
"""
from __future__ import annotations
import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from security import require_admin
from models import Teacher, Subject, ClassSection, User

router = APIRouter(tags=["Import/Export"])

try:
    import openpyxl
    XLSX_OK = True
except ImportError:
    XLSX_OK = False


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _read_rows(file: UploadFile, data: bytes) -> List[dict]:
    """Parse an uploaded CSV or XLSX file into a list of {header: value} dicts,
    with headers lower-cased and trimmed so 'Name', ' name ', 'NAME' all match."""
    name = (file.filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        if not XLSX_OK:
            raise HTTPException(503, "openpyxl not installed on the server — cannot read .xlsx files")
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            headers = [str(h).strip().lower() if h is not None else "" for h in next(rows_iter)]
        except StopIteration:
            return []
        out = []
        for row in rows_iter:
            if row is None or all(v is None or str(v).strip() == "" for v in row):
                continue
            out.append({headers[i]: row[i] for i in range(min(len(headers), len(row)))})
        return out

    # CSV (also tolerates .txt/.tsv via dialect sniffing)
    text = data.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:2048])
    except Exception:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    out = []
    for row in reader:
        clean = {(k or "").strip().lower(): v for k, v in row.items()}
        if any(v and str(v).strip() for v in clean.values()):
            out.append(clean)
    return out


def _get(row: dict, *keys, default=None):
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return default


def _as_bool(val, default=False) -> bool:
    if val is None or val == "":
        return default
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("1", "true", "yes", "y")


def _as_int(val, default=None):
    if val is None or val == "":
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


# ── Teachers ──────────────────────────────────────────────────────────────────

@router.post("/teachers/import")
async def import_teachers(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_admin),
):
    data = await file.read()
    rows = _read_rows(file, data)
    if not rows:
        raise HTTPException(400, "No data rows found in file — check it has a header row plus at least one data row")

    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):  # row 1 is the header
        name = _get(row, "name", "teacher name", "full name")
        if not name or not str(name).strip():
            skipped += 1
            errors.append(f"Row {i}: missing name — skipped")
            continue
        email = _get(row, "email")
        if email and db.query(Teacher).filter(Teacher.email == str(email).strip()).first():
            skipped += 1
            errors.append(f"Row {i}: email '{email}' already exists — skipped")
            continue
        db.add(Teacher(
            name=str(name).strip(),
            email=(str(email).strip() if email else None) or None,
            max_weekly_hours=_as_int(_get(row, "max_weekly_hours", "max hours"), 30),
            is_part_time=_as_bool(_get(row, "is_part_time", "part time")),
            days_off=str(_get(row, "days_off", "days off", default="") or "").strip() or None,
        ))
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} teacher(s)" + (f", skipped {skipped}" if skipped else "")}


# ── Subjects ──────────────────────────────────────────────────────────────────

@router.post("/subjects/import")
async def import_subjects(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_admin),
):
    data = await file.read()
    rows = _read_rows(file, data)
    if not rows:
        raise HTTPException(400, "No data rows found in file — check it has a header row plus at least one data row")

    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        name  = _get(row, "name", "subject name", "subject")
        grade = _get(row, "grade_level", "grade", "grade level")
        if not name or not grade:
            skipped += 1
            errors.append(f"Row {i}: missing name or grade_level — skipped")
            continue
        db.add(Subject(
            name=str(name).strip(),
            grade_level=str(grade).strip(),
            weekly_periods=_as_int(_get(row, "weekly_periods", "periods"), 4),
            allows_double_period=_as_bool(_get(row, "allows_double_period", "double period")),
            is_static_eligible=_as_bool(_get(row, "is_static_eligible", "static")),
            color_hex=str(_get(row, "color_hex", "color", default="") or "").strip() or None,
        ))
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} subject(s)" + (f", skipped {skipped}" if skipped else "")}


# ── Classes ───────────────────────────────────────────────────────────────────

@router.post("/classes/import")
async def import_classes(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_admin),
):
    data = await file.read()
    rows = _read_rows(file, data)
    if not rows:
        raise HTTPException(400, "No data rows found in file — check it has a header row plus at least one data row")

    created, skipped, errors = 0, 0, []
    for i, row in enumerate(rows, start=2):
        name  = _get(row, "name", "class name", "class")
        grade = _get(row, "grade_level", "grade", "grade level")
        if not name or not grade:
            skipped += 1
            errors.append(f"Row {i}: missing name or grade_level — skipped")
            continue
        db.add(ClassSection(
            name=str(name).strip(),
            grade_level=str(grade).strip(),
            stream=str(_get(row, "stream", default="") or "").strip() or None,
            capacity=_as_int(_get(row, "capacity"), 40),
            max_subjects_per_day=_as_int(_get(row, "max_subjects_per_day", "max subjects"), 8),
        ))
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors,
            "message": f"Imported {created} class(es)" + (f", skipped {skipped}" if skipped else "")}


# ── Starter templates ─────────────────────────────────────────────────────────

def _template_csv(filename: str, headers: List[str], example: List[str]) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerow(example)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/teachers/import/template")
def teachers_template(_: User = Depends(require_admin)):
    return _template_csv(
        "teachers_import_template.csv",
        ["name", "email", "max_weekly_hours", "is_part_time", "days_off"],
        ["Mrs Alice Kamau", "alice@school.edu", "25", "false", "Friday"],
    )


@router.get("/subjects/import/template")
def subjects_template(_: User = Depends(require_admin)):
    return _template_csv(
        "subjects_import_template.csv",
        ["name", "grade_level", "weekly_periods", "allows_double_period", "is_static_eligible", "color_hex"],
        ["Mathematics", "7", "5", "false", "false", "#1565c0"],
    )


@router.get("/classes/import/template")
def classes_template(_: User = Depends(require_admin)):
    return _template_csv(
        "classes_import_template.csv",
        ["name", "grade_level", "stream", "capacity", "max_subjects_per_day"],
        ["7A", "7", "", "40", "8"],
    )
