"""SSTG – Schedule API: generate, reshuffle, lock, activate, validate, move (DnD), swap."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import ClassSection, Subject, Teacher, TimetableDraft, TimetableSlot
from schemas import GenerateRequest, ReshuffleRequest, LockSlotRequest
from scheduler import SchedulingEngine
from ws_manager import manager as ws_manager
from security import get_current_user, require_admin

router = APIRouter()


class MoveSlotRequest(BaseModel):
    slot_id: str
    new_day: str
    new_period: int


class SwapSlotsRequest(BaseModel):
    slot_a_id: str
    slot_b_id: str


def _build_maps(db):
    subjects_map = {s.id: {"name": s.name, "color_hex": s.color_hex} for s in db.query(Subject).all()}
    teachers_map = {t.id: t.name for t in db.query(Teacher).all()}
    classes_map  = {c.id: {"name": c.name, "grade_level": c.grade_level} for c in db.query(ClassSection).all()}
    return subjects_map, teachers_map, classes_map


def _slot_out(s, subjects_map, teachers_map, classes_map):
    return {
        "id": s.id, "day": s.day, "period": s.period,
        "class_id": s.class_id,
        "class_name": classes_map.get(s.class_id, {}).get("name"),
        "teacher_id": s.teacher_id,
        "teacher_name": teachers_map.get(s.teacher_id),
        "subject_id": s.subject_id,
        "subject_name": subjects_map.get(s.subject_id, {}).get("name"),
        "subject_color": subjects_map.get(s.subject_id, {}).get("color_hex"),
        "is_locked": s.is_locked,
        "is_break": s.is_break,
        "notes": s.notes,
    }


@router.post("/generate")
async def generate(req: GenerateRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    engine = SchedulingEngine(db)
    drafts = engine.generate_drafts(count=req.draft_count, seeds=req.seeds)
    payload = [{"id": d.id, "name": d.name, "seed": d.seed, "status": d.status,
                "slot_count": len(d.slots), "created_at": d.created_at.isoformat()} for d in drafts]
    await ws_manager.broadcast_global_event({"event": "draft_generated", "drafts": payload})
    return payload


@router.post("/reshuffle")
async def reshuffle(req: ReshuffleRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    engine = SchedulingEngine(db)
    draft = engine.reshuffle(req.draft_id, class_ids=req.class_ids, keep_locked=req.keep_locked)
    result = {"id": draft.id, "name": draft.name, "status": draft.status,
              "slot_count": len(draft.slots), "message": "Reshuffle complete"}
    await ws_manager.broadcast_draft_event(req.draft_id, {"event": "draft_reshuffled", **result})
    await ws_manager.broadcast_global_event({"event": "draft_reshuffled", "draft_id": draft.id})
    return result


@router.post("/move")
async def move_slot(req: MoveSlotRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Drag-and-drop: move a slot to a new day/period."""
    engine = SchedulingEngine(db)
    slot = engine.move_slot(req.slot_id, req.new_day, req.new_period)
    sm, tm, cm = _build_maps(db)
    out = _slot_out(slot, sm, tm, cm)
    await ws_manager.broadcast_draft_event(slot.draft_id, {"event": "slot_moved", "slot": out})
    return out


@router.post("/swap")
async def swap_slots(req: SwapSlotsRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Drag-and-drop: swap two slots' positions."""
    engine = SchedulingEngine(db)
    a, b = engine.swap_slots(req.slot_a_id, req.slot_b_id)
    sm, tm, cm = _build_maps(db)
    out_a, out_b = _slot_out(a, sm, tm, cm), _slot_out(b, sm, tm, cm)
    await ws_manager.broadcast_draft_event(
        a.draft_id, {"event": "slots_swapped", "slot_a": out_a, "slot_b": out_b}
    )
    return {"slot_a": out_a, "slot_b": out_b}


@router.get("/drafts")
def list_drafts(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [{"id": d.id, "name": d.name, "seed": d.seed, "status": d.status,
             "slot_count": len(d.slots), "created_at": d.created_at.isoformat()}
            for d in db.query(TimetableDraft).order_by(TimetableDraft.created_at.desc()).all()]


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    sm, tm, cm = _build_maps(db)
    return {"id": draft.id, "name": draft.name, "seed": draft.seed, "status": draft.status,
            "created_at": draft.created_at.isoformat(),
            "viewer_count": ws_manager.viewer_count(draft_id),
            "slots": [_slot_out(s, sm, tm, cm) for s in draft.slots]}


@router.post("/lock")
async def lock_slot(req: LockSlotRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    slot = db.get(TimetableSlot, req.slot_id)
    if not slot:
        raise HTTPException(404, "Slot not found")
    slot.is_locked = req.locked
    db.commit()
    await ws_manager.broadcast_draft_event(
        slot.draft_id,
        {"event": "slot_locked", "draft_id": slot.draft_id, "slot_id": slot.id, "is_locked": slot.is_locked}
    )
    return {"slot_id": slot.id, "is_locked": slot.is_locked, "draft_id": slot.draft_id}


@router.put("/drafts/{draft_id}/activate")
async def activate_draft(draft_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    db.query(TimetableDraft).filter(TimetableDraft.status == "active").update({"status": "archived"})
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    draft.status = "active"
    db.commit()
    await ws_manager.broadcast_global_event({"event": "draft_activated", "draft_id": draft_id, "name": draft.name})
    return {"message": f"'{draft.name}' is now the active timetable", "id": draft.id}


@router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, db: Session = Depends(get_db), _=Depends(require_admin)):
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    db.delete(draft)
    db.commit()
    await ws_manager.broadcast_global_event({"event": "draft_deleted", "draft_id": draft_id})
    return {"message": "Draft deleted"}


@router.get("/drafts/{draft_id}/validate")
def validate_draft(draft_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return SchedulingEngine(db).validate(draft_id)
