"""Education system management — Cambridge, UNEB, IB, CBC, AP, Custom.

Adds curriculum-aware subject presets: each built-in system ships a starter
set of subjects with realistic subject codes (CAIE syllabus codes, UNEB
subject numbers, IB course codes, AP course codes, CBC learning-area codes).
Used by the onboarding flow so a new school doesn't start from a blank
Subjects page — they pick a curriculum and get a sensible starting set they
can edit or delete afterward.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user
from models import User, EducationSystem, Subject, SchoolSettings

router = APIRouter(tags=["Education Systems"])

BUILT_IN = [
    {"name":"Cambridge CAIE","code":"CAIE","levels":"Form 1,Form 2,Form 3,Form 4,Form 5,Form 6"},
    {"name":"UNEB Uganda",    "code":"UNEB","levels":"S1,S2,S3,S4,S5,S6"},
    {"name":"IB Diploma",     "code":"IB",  "levels":"DP1,DP2"},
    {"name":"American (AP)",  "code":"AP",  "levels":"Grade 9,Grade 10,Grade 11,Grade 12"},
    {"name":"CBC Kenya",      "code":"CBC", "levels":"Grade 1,Grade 2,Grade 3,Grade 4,Grade 5,Grade 6,Grade 7,Grade 8,Grade 9,Grade 10,Grade 11,Grade 12"},
]

# ── Curriculum-specific subject-code presets ───────────────────────────────
# {code: {name, subject_code, weekly_periods, color_hex}}
# Codes/names are realistic starter sets, not an exhaustive syllabus list —
# admins can edit, delete, or add more from the Subjects page afterward.
SUBJECT_PRESETS = {
    "CAIE": [
        {"name": "Mathematics",         "subject_code": "0580", "weekly_periods": 5, "color_hex": "#1565c0"},
        {"name": "English Language",    "subject_code": "0500", "weekly_periods": 4, "color_hex": "#6a1b9a"},
        {"name": "Biology",             "subject_code": "0610", "weekly_periods": 4, "color_hex": "#2e7d32"},
        {"name": "Chemistry",           "subject_code": "0620", "weekly_periods": 4, "color_hex": "#e65100"},
        {"name": "Physics",             "subject_code": "0625", "weekly_periods": 4, "color_hex": "#0277bd"},
        {"name": "History",             "subject_code": "0470", "weekly_periods": 3, "color_hex": "#bf360c"},
        {"name": "Geography",           "subject_code": "0460", "weekly_periods": 3, "color_hex": "#558b2f"},
        {"name": "Business Studies",    "subject_code": "0450", "weekly_periods": 3, "color_hex": "#4527a0"},
        {"name": "Computer Science",    "subject_code": "0478", "weekly_periods": 3, "color_hex": "#00838f"},
    ],
    "UNEB": [
        {"name": "Mathematics",         "subject_code": "456", "weekly_periods": 5, "color_hex": "#1565c0"},
        {"name": "English Language",    "subject_code": "101", "weekly_periods": 4, "color_hex": "#6a1b9a"},
        {"name": "Biology",             "subject_code": "553", "weekly_periods": 4, "color_hex": "#2e7d32"},
        {"name": "Chemistry",           "subject_code": "535", "weekly_periods": 4, "color_hex": "#e65100"},
        {"name": "Physics",             "subject_code": "545", "weekly_periods": 4, "color_hex": "#0277bd"},
        {"name": "History",             "subject_code": "273", "weekly_periods": 3, "color_hex": "#bf360c"},
        {"name": "Geography",           "subject_code": "275", "weekly_periods": 3, "color_hex": "#558b2f"},
        {"name": "Literature in English","subject_code": "111","weekly_periods": 3, "color_hex": "#4527a0"},
        {"name": "Agriculture",         "subject_code": "588", "weekly_periods": 3, "color_hex": "#33691e"},
    ],
    "IB": [
        {"name": "Mathematics AA HL",       "subject_code": "MATH-AA-HL", "weekly_periods": 5, "color_hex": "#1565c0"},
        {"name": "English A Literature HL", "subject_code": "ENG-A-LIT-HL","weekly_periods": 4, "color_hex": "#6a1b9a"},
        {"name": "Biology HL",              "subject_code": "BIO-HL",     "weekly_periods": 4, "color_hex": "#2e7d32"},
        {"name": "Chemistry SL",            "subject_code": "CHEM-SL",    "weekly_periods": 3, "color_hex": "#e65100"},
        {"name": "Physics HL",              "subject_code": "PHYS-HL",    "weekly_periods": 4, "color_hex": "#0277bd"},
        {"name": "Economics SL",            "subject_code": "ECON-SL",    "weekly_periods": 3, "color_hex": "#4527a0"},
        {"name": "History HL",              "subject_code": "HIST-HL",    "weekly_periods": 4, "color_hex": "#bf360c"},
        {"name": "Theory of Knowledge",     "subject_code": "TOK",        "weekly_periods": 2, "color_hex": "#00838f"},
    ],
    "AP": [
        {"name": "AP Calculus AB",          "subject_code": "APCALCAB",  "weekly_periods": 5, "color_hex": "#1565c0"},
        {"name": "AP English Language",     "subject_code": "APENGLANG", "weekly_periods": 4, "color_hex": "#6a1b9a"},
        {"name": "AP Biology",              "subject_code": "APBIO",     "weekly_periods": 4, "color_hex": "#2e7d32"},
        {"name": "AP Chemistry",            "subject_code": "APCHEM",    "weekly_periods": 4, "color_hex": "#e65100"},
        {"name": "AP Physics 1",            "subject_code": "APPHYS1",   "weekly_periods": 4, "color_hex": "#0277bd"},
        {"name": "AP US History",           "subject_code": "APUSH",     "weekly_periods": 3, "color_hex": "#bf360c"},
        {"name": "AP Computer Science A",   "subject_code": "APCSA",     "weekly_periods": 3, "color_hex": "#00838f"},
    ],
    "CBC": [
        {"name": "Mathematics",             "subject_code": "CBC-MATH", "weekly_periods": 5, "color_hex": "#1565c0"},
        {"name": "English",                 "subject_code": "CBC-ENG",  "weekly_periods": 4, "color_hex": "#6a1b9a"},
        {"name": "Kiswahili",               "subject_code": "CBC-KIS",  "weekly_periods": 4, "color_hex": "#4527a0"},
        {"name": "Integrated Science",      "subject_code": "CBC-SCI",  "weekly_periods": 4, "color_hex": "#2e7d32"},
        {"name": "Social Studies",          "subject_code": "CBC-SST",  "weekly_periods": 3, "color_hex": "#bf360c"},
        {"name": "Agriculture & Nutrition", "subject_code": "CBC-AGR",  "weekly_periods": 3, "color_hex": "#33691e"},
        {"name": "Creative Arts",           "subject_code": "CBC-CA",   "weekly_periods": 2, "color_hex": "#ad1457"},
    ],
}


class ESCreate(BaseModel):
    name: str; code: str; levels: Optional[str] = None; is_custom: bool = False


class ApplyPresetsRequest(BaseModel):
    grade_level: str                        # target grade/level to create subjects for
    subject_names: Optional[List[str]] = None  # subset of preset names, or None = all


def _seed(db: Session):
    for b in BUILT_IN:
        if not db.query(EducationSystem).filter(EducationSystem.code==b["code"]).first():
            db.add(EducationSystem(**b)); db.commit()


@router.get("/education-systems")
def list_systems(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.query(EducationSystem).count() == 0:
        _seed(db)
    return [{"id":s.id,"name":s.name,"code":s.code,"levels":s.levels,"is_custom":s.is_custom,
             "has_presets": s.code in SUBJECT_PRESETS}
            for s in db.query(EducationSystem).all()]


@router.get("/education-systems/{code}/subject-presets")
def get_subject_presets(code: str, _: User = Depends(get_current_user)):
    """Return the starter subject list for a curriculum, for onboarding preview."""
    presets = SUBJECT_PRESETS.get(code.upper())
    if presets is None:
        raise HTTPException(404, f"No subject presets available for '{code}' — add subjects manually instead.")
    return presets


@router.post("/education-systems/{code}/apply-presets")
def apply_subject_presets(
    code: str,
    body: ApplyPresetsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Bulk-create Subject rows from a curriculum's preset list for the given
    grade/level, in one call — used by the onboarding wizard so picking a
    curriculum immediately produces a usable Subjects page instead of a
    blank one.
    """
    code = code.upper()
    presets = SUBJECT_PRESETS.get(code)
    if presets is None:
        raise HTTPException(404, f"No subject presets available for '{code}'")

    system = db.query(EducationSystem).filter(EducationSystem.code == code).first()
    if not system:
        if db.query(EducationSystem).count() == 0:
            _seed(db)
        system = db.query(EducationSystem).filter(EducationSystem.code == code).first()
    if not system:
        raise HTTPException(404, f"Curriculum '{code}' not found")

    wanted = set(body.subject_names) if body.subject_names else None
    created, skipped = [], []

    for preset in presets:
        if wanted is not None and preset["name"] not in wanted:
            continue
        exists = db.query(Subject).filter(
            Subject.name == preset["name"],
            Subject.grade_level == body.grade_level,
        ).first()
        if exists:
            skipped.append(preset["name"])
            continue
        s = Subject(
            name=preset["name"],
            subject_code=preset["subject_code"],
            grade_level=body.grade_level,
            weekly_periods=preset["weekly_periods"],
            color_hex=preset["color_hex"],
            education_system_id=system.id,
        )
        db.add(s)
        created.append(preset["name"])

    db.commit()
    return {
        "created": created,
        "skipped": skipped,
        "message": f"Added {len(created)} subject(s) for Grade {body.grade_level}"
                   + (f" — {len(skipped)} already existed" if skipped else ""),
    }


@router.post("/education-systems")
def create_system(data: ESCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.query(EducationSystem).filter(EducationSystem.code==data.code).first():
        raise HTTPException(409,"Code already exists")
    es = EducationSystem(**data.model_dump(), is_custom=True)
    db.add(es); db.commit(); db.refresh(es)
    return {"id":es.id,"name":es.name,"code":es.code}


@router.delete("/education-systems/{es_id}")
def delete_system(es_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    es = db.query(EducationSystem).filter(EducationSystem.id==es_id).first()
    if not es: raise HTTPException(404,"Not found")
    if not es.is_custom: raise HTTPException(400,"Cannot delete built-in systems")
    db.delete(es); db.commit(); return {"status":"deleted"}


# ── School-wide curriculum selection (onboarding) ──────────────────────────

@router.get("/education-systems/active")
def get_active_system(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(SchoolSettings).first()
    return {
        "education_system_id": s.education_system_id if s else None,
        "onboarding_completed": bool(s.onboarding_completed) if s else False,
    }


class SetActiveSystemRequest(BaseModel):
    education_system_id: Optional[str] = None
    onboarding_completed: bool = True


@router.put("/education-systems/active")
def set_active_system(
    body: SetActiveSystemRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = db.query(SchoolSettings).first()
    if not s:
        s = SchoolSettings()
        db.add(s)
    s.education_system_id = body.education_system_id
    s.onboarding_completed = body.onboarding_completed
    db.commit()
    return {"status": "saved", "education_system_id": s.education_system_id}
