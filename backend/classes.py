"""SSTG – Class Sections API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ClassSection, SchoolSettings
from schemas import ClassCreate, ClassUpdate
from security import get_current_user, require_admin

router = APIRouter()


def _fmt(c: ClassSection) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "grade_level": c.grade_level,
        "max_subjects_per_day": c.max_subjects_per_day,
        "education_system_id": c.education_system_id,
    }


@router.get("")
def list_classes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(ClassSection).order_by(ClassSection.grade_level, ClassSection.name).all()
    return [_fmt(c) for c in rows]


@router.post("", status_code=201)
def create_class(req: ClassCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = req.model_dump()
    # FIX: if the class isn't explicitly tagged with a curriculum, default it
    # to the school's active curriculum (set during onboarding) rather than
    # leaving it null — a null curriculum on every class silently defeats
    # the whole point of curriculum-aware scheduling for schools that picked
    # one system during onboarding and just never touch this field per class.
    if not data.get("education_system_id"):
        settings = db.query(SchoolSettings).first()
        if settings and settings.education_system_id:
            data["education_system_id"] = settings.education_system_id

    c = ClassSection(**data)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "education_system_id": c.education_system_id, "message": "Class created"}


@router.get("/{class_id}")
def get_class(class_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.get(ClassSection, class_id)
    if not c:
        raise HTTPException(404, "Class not found")
    return _fmt(c)


@router.put("/{class_id}")
def update_class(class_id: str, req: ClassUpdate,
                 db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.get(ClassSection, class_id)
    if not c:
        raise HTTPException(404, "Class not found")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    db.commit()
    return {"message": "Updated"}


@router.delete("/{class_id}")
def delete_class(class_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.get(ClassSection, class_id)
    if not c:
        raise HTTPException(404, "Class not found")
    db.delete(c)
    db.commit()
    return {"message": "Deleted"}
