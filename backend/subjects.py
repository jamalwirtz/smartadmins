"""SSTG – Subjects API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Subject
from schemas import SubjectCreate, SubjectUpdate
from security import get_current_user, require_admin

router = APIRouter()


@router.get("")
def list_subjects(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Subject).order_by(Subject.grade_level, Subject.name).all()


@router.post("", status_code=201)
def create_subject(req: SubjectCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = Subject(**req.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "message": "Subject created"}


@router.get("/{subject_id}")
def get_subject(subject_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    return s


@router.put("/{subject_id}")
def update_subject(subject_id: str, req: SubjectUpdate,
                   db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    return {"message": "Updated"}


@router.delete("/{subject_id}")
def delete_subject(subject_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(404, "Subject not found")
    db.delete(s)
    db.commit()
    return {"message": "Deleted"}
