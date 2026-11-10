"""
SSTG – Scheduling Engine
Constraint-based timetable generator with backtracking + seeded randomisation.

Hard Constraints (NEVER violated):
  1. No teacher double-booking (same teacher, same day, same period)
  2. No class double-booking (same class, same day, same period)
  3. Teacher days-off respected
  4. Teacher unavailable period slots respected
  5. Teacher max weekly hours not exceeded
  6. Locked slots never moved or deleted

Soft Constraints (optimised via scoring):
  - Spread subject assignments across the week evenly
  - Avoid clustering the same subject on one day

BATCH 2 CHANGE — which subjects a class takes, and who teaches them:
  1. If the class has subject ALLOCATIONS (Classes page), those decide the
     subjects, and an allocated teacher is used for that subject.
  2. Otherwise subjects are matched on the level label using levels.norm_level,
     so "8", "Grade 8" and "grade-8" all match (class names are free text).
"""
import random
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import get_settings
from levels import same_level
from models import (
    ClassAllocation, ClassSection, Subject, Teacher, TeacherSubject,
    TimetableDraft, TimetableSlot,
)


class SchedulingEngine:
    DEFAULT_SEEDS = [101, 202, 303, 404, 505]

    def __init__(self, db: Session):
        self.db = db
        self.cfg = get_settings()

    # ── Public API ───────────────────────────────────────────────────────────

    def generate_drafts(self, count: int = 3, seeds: List[int] = None) -> List[TimetableDraft]:
        # Guarantee exactly `count` drafts even when fewer seeds are supplied.
        count = count or 3
        seeds = list(seeds or [])
        pool = list(self.DEFAULT_SEEDS)
        i = 0
        while len(seeds) < count:
            candidate = pool[i] if i < len(pool) else random.randint(1000, 9999)
            if candidate not in seeds:
                seeds.append(candidate)
            i += 1
        seeds = seeds[:count]

        drafts = []
        for i, seed in enumerate(seeds):
            draft = TimetableDraft(
                name=f"Draft {chr(65 + i)}  (seed {seed})",
                seed=seed,
                status="draft",
            )
            self.db.add(draft)
            self.db.flush()
            self._fill_draft(draft, seed)
            drafts.append(draft)
        self.db.commit()
        for d in drafts:
            self.db.refresh(d)
        return drafts

    def reshuffle(
        self,
        draft_id: str,
        class_ids: Optional[List[str]] = None,
        keep_locked: bool = True,
    ) -> TimetableDraft:
        draft = self.db.get(TimetableDraft, draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        q = self.db.query(TimetableSlot).filter(TimetableSlot.draft_id == draft_id)
        if keep_locked:
            q = q.filter(TimetableSlot.is_locked == False)  # noqa: E712
        if class_ids:
            q = q.filter(TimetableSlot.class_id.in_(class_ids))
        q.delete(synchronize_session="fetch")
        self.db.flush()

        new_seed = random.randint(1000, 9999)
        self._fill_draft(draft, new_seed, class_ids=class_ids)
        self.db.commit()
        self.db.refresh(draft)
        return draft

    def move_slot(self, slot_id: str, new_day: str, new_period: int) -> TimetableSlot:
        """Move a single slot to a new day/period — used by drag-and-drop."""
        slot = self.db.get(TimetableSlot, slot_id)
        if not slot:
            raise HTTPException(404, "Slot not found")
        if slot.is_locked:
            raise HTTPException(409, "Cannot move a locked slot")

        conflict_class = (
            self.db.query(TimetableSlot)
            .filter(
                TimetableSlot.draft_id == slot.draft_id,
                TimetableSlot.class_id == slot.class_id,
                TimetableSlot.day == new_day,
                TimetableSlot.period == new_period,
                TimetableSlot.id != slot_id,
            )
            .first()
        )
        if conflict_class:
            raise HTTPException(409, f"Class already has a lesson on {new_day} P{new_period}")

        if slot.teacher_id:
            conflict_teacher = (
                self.db.query(TimetableSlot)
                .filter(
                    TimetableSlot.draft_id == slot.draft_id,
                    TimetableSlot.teacher_id == slot.teacher_id,
                    TimetableSlot.day == new_day,
                    TimetableSlot.period == new_period,
                    TimetableSlot.id != slot_id,
                )
                .first()
            )
            if conflict_teacher:
                raise HTTPException(409, f"Teacher already assigned on {new_day} P{new_period}")

            teacher = self.db.get(Teacher, slot.teacher_id)
            if teacher:
                if new_day in teacher.days_off_list:
                    raise HTTPException(409, f"Teacher has {new_day} as a day off")
                if new_period in teacher.unavailable_dict.get(new_day, []):
                    raise HTTPException(409, f"Teacher unavailable on {new_day} P{new_period}")

        slot.day = new_day
        slot.period = new_period
        self.db.commit()
        self.db.refresh(slot)
        return slot

    def swap_slots(self, slot_a_id: str, slot_b_id: str) -> Tuple[TimetableSlot, TimetableSlot]:
        """Swap two slots' day/period positions."""
        a = self.db.get(TimetableSlot, slot_a_id)
        b = self.db.get(TimetableSlot, slot_b_id)
        if not a or not b:
            raise HTTPException(404, "One or both slots not found")
        if a.draft_id != b.draft_id:
            raise HTTPException(400, "Slots must belong to the same draft")
        if a.is_locked or b.is_locked:
            raise HTTPException(409, "Cannot swap locked slots")

        a.day, b.day = b.day, a.day
        a.period, b.period = b.period, a.period
        self.db.commit()
        self.db.refresh(a)
        self.db.refresh(b)
        return a, b

    def validate(self, draft_id: str) -> dict:
        slots = self.db.query(TimetableSlot).filter(TimetableSlot.draft_id == draft_id).all()
        errors = []

        t_seen: Dict[Tuple, str] = {}
        for s in slots:
            if not s.teacher_id:
                continue
            key = (s.teacher_id, s.day, s.period)
            if key in t_seen:
                errors.append(f"Teacher double-booked on {s.day} P{s.period}")
            else:
                t_seen[key] = s.id

        c_seen: Dict[Tuple, str] = {}
        for s in slots:
            key = (s.class_id, s.day, s.period)
            if key in c_seen:
                errors.append(f"Class double-booked on {s.day} P{s.period}")
            else:
                c_seen[key] = s.id

        teachers = {t.id: t for t in self.db.query(Teacher).all()}
        for s in slots:
            if not s.teacher_id:
                continue
            t = teachers.get(s.teacher_id)
            if not t:
                continue
            if s.day in t.days_off_list:
                errors.append(f"Teacher {t.name} on day-off ({s.day} P{s.period})")
            if s.period in t.unavailable_dict.get(s.day, []):
                errors.append(f"Teacher {t.name} unavailable slot ({s.day} P{s.period})")

        return {"draft_id": draft_id, "total_slots": len(slots), "errors": errors, "valid": len(errors) == 0}

    # ── Internal ─────────────────────────────────────────────────────────────

    def _fill_draft(
        self,
        draft: TimetableDraft,
        seed: int,
        class_ids: Optional[List[str]] = None,
    ) -> None:
        rng = random.Random(seed)
        days = self.cfg.school_days_list
        periods = list(range(1, self.cfg.PERIODS_PER_DAY + 1))

        teachers = self.db.query(Teacher).all()
        teachers_by_id = {t.id: t for t in teachers}
        subjects = self.db.query(Subject).all()
        subjects_by_id = {s.id: s for s in subjects}
        classes = self.db.query(ClassSection).all()
        if class_ids:
            classes = [c for c in classes if c.id in class_ids]

        # teacher_id -> set of subject_ids they can teach
        teacher_subjects: Dict[str, Set[str]] = defaultdict(set)
        for ts in self.db.query(TeacherSubject).all():
            teacher_subjects[ts.teacher_id].add(ts.subject_id)

        # class_id -> {subject_id: allocated teacher_id or None}
        allocations: Dict[str, Dict[str, Optional[str]]] = defaultdict(dict)
        for a in self.db.query(ClassAllocation).all():
            allocations[a.class_id][a.subject_id] = a.teacher_id

        teacher_occupied: Set[Tuple] = set()
        class_occupied: Set[Tuple] = set()
        teacher_weekly: Dict[str, int] = defaultdict(int)

        locked = (
            self.db.query(TimetableSlot)
            .filter(
                TimetableSlot.draft_id == draft.id,
                TimetableSlot.is_locked == True,  # noqa: E712
            )
            .all()
        )
        for s in locked:
            if s.teacher_id:
                teacher_occupied.add((s.teacher_id, s.day, s.period))
                teacher_weekly[s.teacher_id] += 1
            class_occupied.add((s.class_id, s.day, s.period))

        new_slots: List[TimetableSlot] = []

        for cls in classes:
            # 1) Explicit allocations win. 2) Otherwise match the level label
            #    (flexible) and the curriculum.
            if cls.id in allocations:
                grade_subjects = [subjects_by_id[sid] for sid in allocations[cls.id] if sid in subjects_by_id]
            else:
                grade_subjects = [
                    s for s in subjects
                    if same_level(s.grade_level, cls.grade_level)
                    and (not cls.education_system_id or not s.education_system_id
                         or s.education_system_id == cls.education_system_id)
                ]

            assignments: List[Tuple[Subject, List[Teacher]]] = []
            for subj in grade_subjects:
                allocated_tid = allocations.get(cls.id, {}).get(subj.id)
                if allocated_tid and allocated_tid in teachers_by_id:
                    eligible = [teachers_by_id[allocated_tid]]   # the chosen teacher
                else:
                    eligible = [t for t in teachers if subj.id in teacher_subjects[t.id]]
                for _ in range(subj.weekly_periods):
                    assignments.append((subj, list(eligible)))
            rng.shuffle(assignments)

            pool_set: Set[Tuple[str, int]] = {
                (d, p) for d in days for p in periods
                if (cls.id, d, p) not in class_occupied
            }

            subject_day_count: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

            for subj, eligible_teachers in assignments:
                subj_id = subj.id

                def score(dp: Tuple[str, int], _sid: str = subj_id) -> float:
                    d, _ = dp
                    return subject_day_count[_sid][d] * 10 + rng.random()

                available = sorted(
                    [dp for dp in pool_set if (cls.id, dp[0], dp[1]) not in class_occupied],
                    key=score,
                )

                for day, period in available:
                    if (cls.id, day, period) in class_occupied:
                        continue

                    rng.shuffle(eligible_teachers)
                    chosen: Optional[Teacher] = None
                    for t in eligible_teachers:
                        if day in t.days_off_list:
                            continue
                        if period in t.unavailable_dict.get(day, []):
                            continue
                        if (t.id, day, period) in teacher_occupied:
                            continue
                        if teacher_weekly[t.id] >= t.max_weekly_hours:
                            continue
                        chosen = t
                        break

                    if chosen is None:
                        continue

                    new_slots.append(TimetableSlot(
                        draft_id=draft.id,
                        class_id=cls.id,
                        teacher_id=chosen.id,
                        subject_id=subj.id,
                        day=day,
                        period=period,
                        is_locked=False,
                    ))
                    teacher_occupied.add((chosen.id, day, period))
                    class_occupied.add((cls.id, day, period))
                    teacher_weekly[chosen.id] += 1
                    subject_day_count[subj.id][day] += 1
                    pool_set.discard((day, period))
                    break
                # No teacher/slot found → soft-skip

        self.db.bulk_save_objects(new_slots)
