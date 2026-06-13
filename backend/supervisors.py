"""
Supervisor/Invigilator management for exam sessions.
Any supervisor can be assigned to any exam (unlike teachers who are subject-specific).
Supports: teachers, residential assistants, external affiliates, admins.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user
from models import User, Supervisor, ExamSlot

router = APIRouter(tags=["Supervisors"])

ROLES = ["teacher","ra","external","admin"]

class SupervisorCreate(BaseModel):
    name: str; role: str = "teacher"
    department: Optional[str]=None; email: Optional[str]=None
    phone: Optional[str]=None; max_sessions: int=3
    availability: Optional[str]=None  # "Monday,Tuesday,Wednesday"

class SupervisorUpdate(BaseModel):
    name: Optional[str]=None; role: Optional[str]=None
    department: Optional[str]=None; email: Optional[str]=None
    phone: Optional[str]=None; max_sessions: Optional[int]=None
    availability: Optional[str]=None; is_active: Optional[bool]=None

def _fmt(s: Supervisor, session_count: int = 0) -> dict:
    return {
        "id": s.id, "name": s.name, "role": s.role,
        "department": s.department, "email": s.email,
        "phone": s.phone, "max_sessions": s.max_sessions,
        "availability": s.availability, "is_active": s.is_active,
        "session_count": session_count,
    }

@router.get("/supervisors")
def list_supervisors(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    sups = db.query(Supervisor).filter(Supervisor.is_active==True).all()
    counts = {}
    for sl in db.query(ExamSlot).filter(ExamSlot.invigilator_id != None).all():
        counts[sl.invigilator_id] = counts.get(sl.invigilator_id, 0) + 1
    return [_fmt(s, counts.get(s.id, 0)) for s in sups]

@router.post("/supervisors")
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if data.role not in ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(ROLES)}")
    s = Supervisor(**data.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return _fmt(s)

@router.put("/supervisors/{sup_id}")
def update_supervisor(sup_id: str, data: SupervisorUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Supervisor).filter(Supervisor.id==sup_id).first()
    if not s: raise HTTPException(404,"Supervisor not found")
    for k,v in data.model_dump(exclude_none=True).items(): setattr(s,k,v)
    db.commit(); return _fmt(s)

@router.delete("/supervisors/{sup_id}")
def delete_supervisor(sup_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Supervisor).filter(Supervisor.id==sup_id).first()
    if not s: raise HTTPException(404,"Not found")
    s.is_active = False; db.commit(); return {"status":"deleted"}

@router.get("/supervisors/availability")
def available_supervisors(day: Optional[str]=None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Return supervisors available on a given day."""
    sups = db.query(Supervisor).filter(Supervisor.is_active==True).all()
    if day:
        sups = [s for s in sups if not s.availability or day in (s.availability or "")]
    return [_fmt(s) for s in sups]
