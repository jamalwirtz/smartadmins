"""SSTG – Class Sections API routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import ClassSection
from schemas import ClassCreate, ClassUpdate
from security import get_current_user, require_admin

router = APIRouter()


@router.get("")
def list_classes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(ClassSection).order_by(ClassSection.grade_level, ClassSection.name).all()


@router.post("", status_code=201)
def create_class(req: ClassCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = ClassSection(**req.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "message": "Class created"}


@router.get("/{class_id}")
def get_class(class_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.get(ClassSection, class_id)
    if not c:
        raise HTTPException(404, "Class not found")
    return c


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
