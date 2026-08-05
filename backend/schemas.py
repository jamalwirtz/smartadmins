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
    # FIX: previously missing — the frontend has sent subject_code from
    # several places (Classes.jsx inline "create subject", the new curriculum
    # preset importer) but it was silently dropped by Pydantic since this
    # schema had no matching field. Now it's actually persisted.
    subject_code: Optional[str] = None
    grade_level: str
    weekly_periods: int = 4
    allows_double_period: bool = False
    is_static_eligible: bool = False
    color_hex: Optional[str] = None
    education_system_id: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    subject_code: Optional[str] = None
    grade_level: Optional[str] = None
    weekly_periods: Optional[int] = None
    allows_double_period: Optional[bool] = None
    is_static_eligible: Optional[bool] = None
    color_hex: Optional[str] = None
    education_system_id: Optional[str] = None

class SubjectOut(BaseModel):
    id: str
    name: str
    subject_code: Optional[str] = None
    grade_level: str
    weekly_periods: int
    allows_double_period: bool
    is_static_eligible: bool
    color_hex: Optional[str]
    education_system_id: Optional[str] = None
    class Config:
        from_attributes = True


# ── ClassSection ─────────────────────────────────────────────────────────────

class ClassCreate(BaseModel):
    name: str
    grade_level: str
    max_subjects_per_day: int = 8
    # FIX: ClassSection.education_system_id already existed on the model but
    # was never exposed here, so a class could never actually be tagged with
    # a curriculum — the scheduler had no way to avoid cross-matching a CBC
    # class with subjects imported for a different curriculum that happens
    # to share the same grade_level string (e.g. both use "7").
    education_system_id: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    grade_level: Optional[str] = None
    max_subjects_per_day: Optional[int] = None
    education_system_id: Optional[str] = None

class ClassOut(BaseModel):
    id: str
    name: str
    grade_level: str
    max_subjects_per_day: int
    education_system_id: Optional[str] = None
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


# ── Exam Layout Templates (multi-template exam editor) ────────────────────────

class ExamLayoutTemplateCreate(BaseModel):
    name: str
    group_by: str = "day"          # day | class
    orientation: str = "landscape" # landscape | portrait
    show_duration: bool = True
    show_invigilator: bool = True
    show_room: bool = True
    show_notes: bool = False
    show_practical_tag: bool = True
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None
    is_default: bool = False


class ExamLayoutTemplateUpdate(BaseModel):
    name: Optional[str] = None
    group_by: Optional[str] = None
    orientation: Optional[str] = None
    show_duration: Optional[bool] = None
    show_invigilator: Optional[bool] = None
    show_room: Optional[bool] = None
    show_notes: Optional[bool] = None
    show_practical_tag: Optional[bool] = None
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None


class ExamLayoutTemplateOut(BaseModel):
    id: str
    name: str
    is_default: bool
    group_by: str
    orientation: str
    show_duration: bool
    show_invigilator: bool
    show_room: bool
    show_notes: bool
    show_practical_tag: bool
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None

    class Config:
        from_attributes = True


# ── Timetable Layout Templates (curriculum-aware timetable editor) ────────────

class TimetableLayoutTemplateCreate(BaseModel):
    name: str
    orientation: str = "landscape"   # landscape | portrait
    show_locked_badge: bool = True
    show_room: bool = False
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None
    is_default: bool = False


class TimetableLayoutTemplateUpdate(BaseModel):
    name: Optional[str] = None
    orientation: Optional[str] = None
    show_locked_badge: Optional[bool] = None
    show_room: Optional[bool] = None
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None


class TimetableLayoutTemplateOut(BaseModel):
    id: str
    name: str
    is_default: bool
    orientation: str
    show_locked_badge: bool
    show_room: bool
    footer_text: Optional[str] = None
    warning_text: Optional[str] = None

    class Config:
        from_attributes = True
