"""Education system management — Cambridge, UNEB, IB, CBC, Custom."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user
from models import User, EducationSystem

router = APIRouter(tags=["Education Systems"])

BUILT_IN = [
    {"name":"Cambridge CAIE","code":"CAIE","levels":"Form 1,Form 2,Form 3,Form 4,Form 5,Form 6"},
    {"name":"UNEB Uganda",    "code":"UNEB","levels":"S1,S2,S3,S4,S5,S6"},
    {"name":"IB Diploma",     "code":"IB",  "levels":"DP1,DP2"},
    {"name":"American (AP)",  "code":"AP",  "levels":"Grade 9,Grade 10,Grade 11,Grade 12"},
    {"name":"CBC Kenya",      "code":"CBC", "levels":"Grade 1,Grade 2,Grade 3,Grade 4,Grade 5,Grade 6,Grade 7,Grade 8,Grade 9,Grade 10,Grade 11,Grade 12"},
]

class ESCreate(BaseModel):
    name: str; code: str; levels: Optional[str] = None; is_custom: bool = False

def _seed(db: Session):
    for b in BUILT_IN:
        if not db.query(EducationSystem).filter(EducationSystem.code==b["code"]).first():
            db.add(EducationSystem(**b)); db.commit()

@router.get("/education-systems")
def list_systems(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    # _seed only if empty (check count first — fast single query)
    if db.query(EducationSystem).count() == 0:
        _seed(db)
    return [{"id":s.id,"name":s.name,"code":s.code,"levels":s.levels,"is_custom":s.is_custom}
            for s in db.query(EducationSystem).all()]

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
