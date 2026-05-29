"""SSTG – Pydantic request/response schemas."""
from typing import List, Optional
from pydantic import BaseModel


# ── Auth ─────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    name: str = ""  # optional display name

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: str
    username: str
    email: str
    is_admin: bool
    class Config:
        from_attributes = True


# ── Teacher ──────────────────────────────────────────────────────────────────

class TeacherCreate(BaseModel):
    name: str
    email: Optional[str] = None
    is_part_time: bool = False
    max_weekly_hours: int = 30
    days_off: Optional[str] = None
    unavailable_slots: Optional[str] = None

class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_part_time: Optional[bool] = None
    max_weekly_hours: Optional[int] = None
    days_off: Optional[str] = None
    unavailable_slots: Optional[str] = None

class SubjectAssignRequest(BaseModel):
    subject_ids: List[str]

class TeacherOut(BaseModel):
    id: str
    name: str
    email: Optional[str]
    is_part_time: bool
    max_weekly_hours: int
    days_off: Optional[str]
    unavailable_slots: Optional[str]
    subject_ids: List[str] = []
    class Config:
        from_attributes = True


# ── Subject ──────────────────────────────────────────────────────────────────

class SubjectCreate(BaseModel):
    name: str
    grade_level: str
    weekly_periods: int = 4
    allows_double_period: bool = False
    is_static_eligible: bool = False
    color_hex: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    grade_level: Optional[str] = None
    weekly_periods: Optional[int] = None
    allows_double_period: Optional[bool] = None
    is_static_eligible: Optional[bool] = None
    color_hex: Optional[str] = None

class SubjectOut(BaseModel):
    id: str
    name: str
    grade_level: str
    weekly_periods: int
    allows_double_period: bool
    is_static_eligible: bool
    color_hex: Optional[str]
    class Config:
        from_attributes = True


# ── ClassSection ─────────────────────────────────────────────────────────────

class ClassCreate(BaseModel):
    name: str
    grade_level: str
    max_subjects_per_day: int = 8

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    grade_level: Optional[str] = None
    max_subjects_per_day: Optional[int] = None

class ClassOut(BaseModel):
    id: str
    name: str
    grade_level: str
    max_subjects_per_day: int
    class Config:
        from_attributes = True


# ── Schedule ─────────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    draft_count: int = 3
    seeds: Optional[List[int]] = None

class ReshuffleRequest(BaseModel):
    draft_id: str
    class_ids: Optional[List[str]] = None
    keep_locked: bool = True

class LockSlotRequest(BaseModel):
    slot_id: str
    locked: bool = True

class SlotOut(BaseModel):
    id: str
    day: str
    period: int
    class_id: str
    class_name: Optional[str]
    teacher_id: Optional[str]
    teacher_name: Optional[str]
    subject_id: Optional[str]
    subject_name: Optional[str]
    subject_color: Optional[str]
    is_locked: bool
    is_break: bool

class DraftOut(BaseModel):
    id: str
    name: str
    seed: int
    status: str
    slot_count: int = 0

class DraftDetailOut(BaseModel):
    id: str
    name: str
    seed: int
    status: str
    slots: List[SlotOut]


# ── Export / Email ────────────────────────────────────────────────────────────

class EmailScheduleRequest(BaseModel):
    teacher_id: str
    draft_id: str
    custom_message: Optional[str] = None


# ── Validation ───────────────────────────────────────────────────────────────

class ValidationResult(BaseModel):
    draft_id: str
    total_slots: int
    errors: List[str]
    valid: bool


# ── Exam Schemas ───────────────────────────────────────────────────────────────

class ExamPaperCreate(BaseModel):
    paper_number: int  # 1-6
    duration_minutes: int = 120
    is_practical: bool = False


class ExamSessionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: str  # "2024-06-01"
    end_date: str    # "2024-06-30"


class ExamSlotCreate(BaseModel):
    paper_id: str
    class_id: str
    day: str
    period: int
    invigilator_id: Optional[str] = None
    room: Optional[str] = None


class ExamSlotUpdate(BaseModel):
    day: Optional[str] = None
    period: Optional[int] = None
    invigilator_id: Optional[str] = None
    room: Optional[str] = None
    is_locked: Optional[bool] = None


class ExamSlotOut(BaseModel):
    id: str
    paper_id: str
    class_id: str
    day: str
    period: int
    room: Optional[str] = None
    is_locked: bool = False

    class Config:
        from_attributes = True


class ExamSessionOut(BaseModel):
    id: str
    name: str
    status: str
    start_date: str
    end_date: str
    slots: List[ExamSlotOut]

    class Config:
        from_attributes = True
