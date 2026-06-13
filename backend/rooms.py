"""Room management for exam and class scheduling."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user
from models import User, Room

router = APIRouter(tags=["Rooms"])

class RoomCreate(BaseModel):
    name: str; building: Optional[str]=None
    capacity: int=30; equipment: Optional[str]=None

class RoomUpdate(BaseModel):
    name: Optional[str]=None; building: Optional[str]=None
    capacity: Optional[int]=None; equipment: Optional[str]=None
    is_active: Optional[bool]=None

def _fmt(r): return {"id":r.id,"name":r.name,"building":r.building,
    "capacity":r.capacity,"equipment":r.equipment,"is_active":r.is_active}

@router.get("/rooms")
def list_rooms(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [_fmt(r) for r in db.query(Room).filter(Room.is_active==True).all()]

@router.post("/rooms")
def create_room(data: RoomCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    r = Room(**data.model_dump()); db.add(r); db.commit(); db.refresh(r)
    return _fmt(r)

@router.put("/rooms/{room_id}")
def update_room(room_id: str, data: RoomUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    r = db.query(Room).filter(Room.id==room_id).first()
    if not r: raise HTTPException(404,"Room not found")
    for k,v in data.model_dump(exclude_none=True).items(): setattr(r,k,v)
    db.commit(); return _fmt(r)

@router.delete("/rooms/{room_id}")
def delete_room(room_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    r = db.query(Room).filter(Room.id==room_id).first()
    if not r: raise HTTPException(404,"Room not found")
    r.is_active = False; db.commit(); return {"status":"deleted"}
