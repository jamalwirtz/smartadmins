"""
SSTG – ORM Models (all tables).

Python 3.14 compatibility note:
  datetime.utcnow() is deprecated since Python 3.12 and emits DeprecationWarning.
  All timestamps now use `datetime.now(timezone.utc)` (timezone-aware UTC).
  SQLAlchemy's `func.now()` is used for server-side timestamps in production.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    """Timezone-aware UTC now — replaces deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id              = Column(String(36),  primary_key=True, default=_uuid)
    username        = Column(String(80),  unique=True, nullable=False)
    email           = Column(String(120), unique=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    is_admin        = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), default=_now)


class Teacher(Base):
    __tablename__ = "teachers"
    id               = Column(String(36),  primary_key=True, default=_uuid)
    name             = Column(String(120), nullable=False)
    initials         = Column(String(10),  nullable=True)   # auto or manual: "AK", "MAK"
    short_name       = Column(String(40),  nullable=True)   # e.g. "Mr Kamau"
    phone            = Column(String(40),  nullable=True)
    email            = Column(String(120), unique=True, nullable=True)
    is_part_time     = Column(Boolean, default=False)
    max_weekly_hours = Column(Integer, default=30)
    days_off         = Column(String(200), nullable=True)   # "Monday,Friday"
    unavailable_slots= Column(Text, nullable=True)          # JSON: {"Monday":[1,2]}
    created_at       = Column(DateTime(timezone=True), default=_now)

    subjects        = relationship("TeacherSubject", back_populates="teacher", cascade="all, delete-orphan")
    timetable_slots = relationship("TimetableSlot", back_populates="teacher")

    @property
    def days_off_list(self) -> List[str]:
        return [d.strip() for d in self.days_off.split(",")] if self.days_off else []

    @property
    def unavailable_dict(self) -> Dict[str, List[int]]:
        try:
            return json.loads(self.unavailable_slots) if self.unavailable_slots else {}
        except Exception:
            return {}


class Subject(Base):
    __tablename__ = "subjects"
    id                  = Column(String(36), primary_key=True, default=_uuid)
    name                = Column(String(120), nullable=False)
    grade_level         = Column(String(20),  nullable=False)
    weekly_periods      = Column(Integer, default=4)
    allows_double_period= Column(Boolean, default=False)
    is_static_eligible  = Column(Boolean, default=False)
    color_hex           = Column(String(7),   nullable=True)
    created_at          = Column(DateTime(timezone=True), default=_now)

    teacher_assignments = relationship("TeacherSubject", back_populates="subject")
    timetable_slots     = relationship("TimetableSlot",  back_populates="subject")


class TeacherSubject(Base):
    __tablename__ = "teacher_subjects"
    __table_args__ = (UniqueConstraint("teacher_id", "subject_id"),)
    id         = Column(String(36), primary_key=True, default=_uuid)
    teacher_id = Column(String(36), ForeignKey("teachers.id", ondelete="CASCADE"))
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"))
    teacher    = relationship("Teacher", back_populates="subjects")
    subject    = relationship("Subject", back_populates="teacher_assignments")


class ClassSection(Base):
    __tablename__ = "class_sections"
    id                  = Column(String(36), primary_key=True, default=_uuid)
    name                = Column(String(40),  nullable=False)
    grade_level         = Column(String(20),  nullable=False)
    max_subjects_per_day= Column(Integer, default=8)
    stream              = Column(String(40),  nullable=True)
    education_system_id = Column(String(36), ForeignKey('education_systems.id', ondelete='SET NULL'), nullable=True)   # e.g. "Blue", "Science"
    capacity            = Column(Integer,     default=40)      # max students
    created_at          = Column(DateTime(timezone=True), default=_now)

    timetable_slots = relationship("TimetableSlot", back_populates="class_section")


class TimetableDraft(Base):
    __tablename__ = "timetable_drafts"
    id         = Column(String(36), primary_key=True, default=_uuid)
    name       = Column(String(80),  nullable=False)
    seed       = Column(Integer, default=0)
    status     = Column(String(20),  default="draft")   # draft | active | archived
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    slots = relationship("TimetableSlot", back_populates="draft", cascade="all, delete-orphan")


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"
    __table_args__ = (
        UniqueConstraint("draft_id", "class_id", "day", "period", name="uq_class_slot"),
    )
    id         = Column(String(36), primary_key=True, default=_uuid)
    draft_id   = Column(String(36), ForeignKey("timetable_drafts.id",  ondelete="CASCADE"))
    class_id   = Column(String(36), ForeignKey("class_sections.id",    ondelete="CASCADE"))
    teacher_id = Column(String(36), ForeignKey("teachers.id",          ondelete="SET NULL"), nullable=True)
    subject_id = Column(String(36), ForeignKey("subjects.id",          ondelete="SET NULL"), nullable=True)
    day        = Column(String(12), nullable=False)
    period     = Column(Integer,    nullable=False)
    is_locked   = Column(Boolean,      default=False)
    is_break    = Column(Boolean,      default=False)
    slot_type   = Column(String(30),   default='lesson')
    # slot_type options:
    #   lesson   — normal class period
    #   break    — short break/recess
    #   lunch    — lunch period
    #   assembly — whole-school assembly
    #   devotion — morning devotion / chapel
    #   event    — custom school event
    #   free     — free period / study hall
    event_label = Column(String(80),   nullable=True)   # custom label for assembly/devotion/event
    event_color = Column(String(7),    nullable=True)   # hex colour for special slots
    notes       = Column(String(200),  nullable=True)

    draft         = relationship("TimetableDraft",  back_populates="slots")
    class_section = relationship("ClassSection",    back_populates="timetable_slots")
    teacher       = relationship("Teacher",         back_populates="timetable_slots")
    subject       = relationship("Subject",         back_populates="timetable_slots")


class ExamPaper(Base):
    """
    Exam papers for a subject (Paper 1, Paper 2, etc.).
    Each subject can have 1-6 papers configured by the admin.
    """
    __tablename__ = "exam_papers"
    __table_args__ = (UniqueConstraint("subject_id", "paper_number"),)
    
    id           = Column(String(36), primary_key=True, default=_uuid)
    subject_id   = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    paper_number = Column(Integer, nullable=False)  # 1-6
    duration_minutes = Column(Integer, default=120)  # e.g., 2 hours = 120 mins
    is_practical = Column(Boolean, default=False)
    created_at   = Column(DateTime(timezone=True), default=_now)
    
    subject      = relationship("Subject", foreign_keys=[subject_id])
    exam_slots   = relationship("ExamSlot", back_populates="paper", cascade="all, delete-orphan")


class ExamSlot(Base):
    """
    A scheduled exam session — one paper, one class, one time slot.
    """
    __tablename__ = "exam_slots"
    __table_args__ = (
        UniqueConstraint("exam_session_id", "class_id", "paper_id", name="uq_exam_slot"),
        UniqueConstraint("exam_session_id", "class_id", "day", "period", name="uq_exam_time"),
    )
    
    id               = Column(String(36), primary_key=True, default=_uuid)
    exam_session_id  = Column(String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False)
    paper_id         = Column(String(36), ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False)
    class_id         = Column(String(36), ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    day              = Column(String(12), nullable=False)
    period           = Column(Integer, nullable=False)
    invigilator_id   = Column(String(36), ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    room             = Column(String(80), nullable=True)  # e.g., "Science Lab", "Hall A"
    is_locked        = Column(Boolean, default=False)
    notes            = Column(String(200), nullable=True)
    
    exam_session = relationship("ExamSession", back_populates="slots")
    paper        = relationship("ExamPaper", back_populates="exam_slots")
    class_section= relationship("ClassSection")
    invigilator  = relationship("Teacher")


class ExamSession(Base):
    """
    An exam timetable session (e.g., "June 2024 Final Exams").
    """
    __tablename__ = "exam_sessions"
    
    id          = Column(String(36), primary_key=True, default=_uuid)
    name        = Column(String(80), nullable=False)
    description = Column(String(300), nullable=True)
    start_date  = Column(String(10), nullable=False)  # "2024-06-01"
    end_date    = Column(String(10), nullable=False)
    status      = Column(String(20), default="draft")  # draft | published | completed
    created_at  = Column(DateTime(timezone=True), default=_now)
    updated_at  = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    
    slots = relationship("ExamSlot", back_populates="exam_session", cascade="all, delete-orphan")


class SchoolSettings(Base):
    """
    School-wide configuration stored in the database.
    Editable from Settings page by admin.
    One row per school (id = 1).
    """
    __tablename__ = "school_settings"

    id            = Column(Integer, primary_key=True, default=1)
    school_name   = Column(String(120), default="Greenfield Academy")
    academic_year = Column(String(20),  default="2025/2026")
    school_motto  = Column(String(200), nullable=True)
    school_email  = Column(String(120), nullable=True)
    school_phone  = Column(String(40),  nullable=True)
    school_address= Column(String(300), nullable=True)
    country_code  = Column(String(4),   default="ZA")
    badge_data    = Column(Text,        nullable=True)   # base64-encoded logo image
    badge_mime    = Column(String(30),  nullable=True)   # "image/png" | "image/jpeg"
    badge_position= Column(String(20),  default="top-left")  # top-left|top-center|top-right
    # Timetable time config
    start_time    = Column(String(5),   default="08:00")  # "08:00"
    period_minutes= Column(Integer,     default=45)
    break_after_period = Column(Integer, default=2)      # break after period N
    break_minutes = Column(Integer,     default=15)
    lunch_after_period = Column(Integer, default=4)
    lunch_minutes = Column(Integer,     default=45)
    # Display preferences
    timetable_theme     = Column(String(20), default="navy")   # navy|green|amber|rose|slate
    timetable_orientation    = Column(String(12),  default="horizontal")
    teacher_name_format      = Column(String(20),  default="full_name")  # full_name|initials|short_name
    exam_include_supervisors = Column(Boolean,      default=True)
    exam_include_rooms       = Column(Boolean,      default=True)
    periods_per_day          = Column(Integer,      default=8)
    school_days         = Column(String(80), default="Monday,Tuesday,Wednesday,Thursday,Friday")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class UserProfile(Base):
    """Extended profile for user — photo, display name, etc."""
    __tablename__ = "user_profiles"

    id           = Column(String(36), primary_key=True, default=_uuid)
    user_id      = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, unique=True)
    display_name = Column(String(80),  nullable=True)
    bio          = Column(String(300), nullable=True)
    photo_data   = Column(Text,        nullable=True)   # base64 encoded
    photo_mime   = Column(String(30),  nullable=True)
    updated_at   = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    user = relationship("User", backref="profile")


class ClassAllocation(Base):
    """
    Tracks which teacher is allocated to teach a subject in a specific class.
    Status = 'pending' when no teacher assigned yet, 'assigned' when one is set.
    This drives the pending-allocations dashboard widget.
    """
    __tablename__ = "class_allocations"
    __table_args__ = (
        UniqueConstraint("class_id", "subject_id", name="uq_class_subject"),
    )

    id         = Column(String(36), primary_key=True, default=_uuid)
    class_id   = Column(String(36), ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(String(36), ForeignKey("subjects.id",       ondelete="CASCADE"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("teachers.id",       ondelete="SET NULL"), nullable=True)
    status     = Column(String(12), default="pending")  # pending | assigned
    notes      = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    class_section = relationship("ClassSection", backref="allocations")
    subject       = relationship("Subject")
    teacher       = relationship("Teacher")


# ── Education System ───────────────────────────────────────────────────────────
class EducationSystem(Base):
    """Cambridge, UNEB, IB, CBC, Custom — filters classes, subjects, papers."""
    __tablename__ = "education_systems"
    id      = Column(String(36), primary_key=True, default=_uuid)
    name    = Column(String(80),  nullable=False, unique=True)  # "Cambridge CAIE"
    code    = Column(String(20),  nullable=False, unique=True)  # "CAIE"
    levels  = Column(String(200), nullable=True)   # "Form 1,Form 2,Form 3,Form 4,Form 5,Form 6"
    is_custom = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)


# ── Room ──────────────────────────────────────────────────────────────────────
class Room(Base):
    """Exam/class rooms with capacity and equipment info."""
    __tablename__ = "rooms"
    id        = Column(String(36), primary_key=True, default=_uuid)
    name      = Column(String(80),  nullable=False)
    building  = Column(String(80),  nullable=True)
    capacity  = Column(Integer,     default=30)
    equipment = Column(String(300), nullable=True)  # "projector,lab bench,computers"
    is_active = Column(Boolean,     default=True)
    created_at = Column(DateTime(timezone=True), default=_now)


# ── Supervisor ────────────────────────────────────────────────────────────────
class Supervisor(Base):
    """
    Supervisors / invigilators for exam sessions.
    Can be teachers, residential assistants, external affiliates, or admins.
    Separate from Teacher model — any supervisor can invigilate any exam.
    """
    __tablename__ = "supervisors"
    id           = Column(String(36), primary_key=True, default=_uuid)
    name         = Column(String(80),  nullable=False)
    role         = Column(String(40),  default="teacher")  # teacher|ra|external|admin
    department   = Column(String(80),  nullable=True)
    email        = Column(String(120), nullable=True)
    phone        = Column(String(40),  nullable=True)
    max_sessions = Column(Integer,     default=3)    # max per day
    availability = Column(String(200), nullable=True)  # "Monday,Tuesday,Wednesday"
    is_active    = Column(Boolean,     default=True)
    created_at   = Column(DateTime(timezone=True), default=_now)

    exam_slots = relationship("ExamSlot",
                              foreign_keys="ExamSlot.invigilator_id",
                              backref="supervisor_rel",
                              overlaps="invigilator")
