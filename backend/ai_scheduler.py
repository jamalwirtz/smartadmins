"""
SSTG — AI Scheduling Assistant (Google Gemini, free tier)
==========================================================
Provides natural-language schedule generation and optimization.

Free tier limits (gemini-2.0-flash):
  • 15 requests / minute
  • 1,000,000 tokens / day
  • No credit card required

Get your API key at: https://aistudio.google.com/app/apikey
Set as environment variable: GEMINI_API_KEY
"""
from __future__ import annotations

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user
from models import User, Subject, ClassSection, Teacher, ExamPaper
from config import get_settings

router = APIRouter(tags=["AI Assistant"])

# ── Gemini client (lazy init so app starts even without key) ──────────────────
_gemini_model = None

def _get_model():
    global _gemini_model
    if _gemini_model:
        return _gemini_model

    cfg = get_settings()
    if not cfg.GEMINI_API_KEY:
        raise HTTPException(
            503,
            detail=(
                "AI Assistant requires a Gemini API key. "
                "Get a free key at https://aistudio.google.com/app/apikey "
                "then set GEMINI_API_KEY in your environment variables."
            )
        )
    try:
        import google.generativeai as genai
        genai.configure(api_key=cfg.GEMINI_API_KEY)
        _gemini_model = genai.GenerativeModel("gemini-2.0-flash")
        return _gemini_model
    except ImportError:
        raise HTTPException(
            503,
            "google-generativeai package not installed. "
            "Run: pip install google-generativeai"
        )


# ── Request / Response models ─────────────────────────────────────────────────

class AIChatRequest(BaseModel):
    message: str
    context: Optional[str] = None   # 'timetable' | 'exam' | None


class AIChatResponse(BaseModel):
    reply:       str
    suggestions: list[dict] = []    # structured suggestions the UI can act on
    action:      Optional[str] = None


class AIGenerateRequest(BaseModel):
    prompt:     str              # e.g. "Schedule Maths before lunch every day"
    session_id: Optional[str] = None   # exam session if context is exam
    draft_id:   Optional[str] = None   # timetable draft if context is timetable


# ── System prompt builder ─────────────────────────────────────────────────────

def _build_system_prompt(db: Session, context: str | None) -> str:
    cfg      = get_settings()
    subjects = db.query(Subject).all()
    classes  = db.query(ClassSection).all()
    teachers = db.query(Teacher).all()

    subj_list  = ", ".join(f"{s.name} (Gr{s.grade_level})" for s in subjects[:20])
    class_list = ", ".join(c.name for c in classes[:20])
    tchr_list  = ", ".join(t.name.split()[0] for t in teachers[:10])

    return f"""You are an intelligent school scheduling assistant for {cfg.SCHOOL_NAME}.
Academic year: {cfg.ACADEMIC_YEAR}
School days: {cfg.SCHOOL_DAYS}
Periods per day: {cfg.PERIODS_PER_DAY}

Current data:
- Subjects: {subj_list or 'none configured yet'}
- Classes: {class_list or 'none configured yet'}
- Teachers: {tchr_list or 'none configured yet'}

Context: {context or 'general scheduling'}

You help the admin:
1. Generate balanced timetables and exam schedules
2. Resolve conflicts (teacher double-booking, student overload)
3. Apply scheduling constraints (e.g. "no Maths on Friday afternoon")
4. Suggest optimal arrangements based on best practices

IMPORTANT RULES:
- Never schedule the same teacher in two classes at the same time
- No class should have more than 2 of the same subject per day
- Practical/lab subjects need longer slots
- Always respond concisely and practically
- When you suggest changes, also return a JSON block with structured data

If you are suggesting schedule changes, ALWAYS include at the end of your reply
a JSON block in this exact format (replace with actual values):
```json
{{
  "action": "suggest_slots" | "suggest_exam_dates" | "add_constraint" | "info_only",
  "suggestions": [
    {{
      "type": "slot",
      "subject": "Mathematics",
      "class": "7A",
      "day": "Monday",
      "period": 2
    }}
  ]
}}
```
If you have no structured suggestions, set action to "info_only" and suggestions to [].
"""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/ai/chat", response_model=AIChatResponse)
def ai_chat(
    req: AIChatRequest,
    db:  Session = Depends(get_db),
    _:   User    = Depends(get_current_user),
):
    """
    General AI chat — ask anything about your timetable.
    Examples:
      "Which teacher has the lightest load?"
      "Can we fit an extra Maths period on Wednesdays?"
      "How should I structure Grade 8 exam week?"
    """
    model = _get_model()
    system = _build_system_prompt(db, req.context)

    prompt = f"{system}\n\nUser: {req.message}"

    try:
        response = model.generate_content(prompt)
        reply    = response.text
    except Exception as e:
        raise HTTPException(502, f"Gemini API error: {e}")

    # Try to extract structured JSON from the reply
    suggestions = []
    action      = "info_only"

    if "```json" in reply:
        try:
            json_str = reply.split("```json")[1].split("```")[0].strip()
            parsed   = json.loads(json_str)
            suggestions = parsed.get("suggestions", [])
            action      = parsed.get("action", "info_only")
            # Clean the JSON block from the displayed reply
            reply = reply.split("```json")[0].strip()
        except (json.JSONDecodeError, IndexError):
            pass

    return AIChatResponse(reply=reply, suggestions=suggestions, action=action)


@router.post("/ai/generate-timetable-prompt")
def ai_generate_timetable(
    req: AIGenerateRequest,
    db:  Session = Depends(get_db),
    _:   User    = Depends(get_current_user),
):
    """
    Use AI to generate a complete slot arrangement from a natural language prompt.
    Returns a list of suggested slots ready to be applied.

    Example prompts:
      "Create a balanced weekly timetable for Grade 7A"
      "Schedule all subjects evenly across the week for Grade 8"
      "Put double Maths on Monday and Thursday mornings for all classes"
    """
    model    = _get_model()
    cfg      = get_settings()
    subjects = db.query(Subject).all()
    classes  = db.query(ClassSection).all()
    teachers = db.query(Teacher).all()

    # Build a detailed context for this specific generation task
    subj_json = [
        {"id": s.id, "name": s.name, "grade": s.grade_level,
         "periods_per_week": s.weekly_periods}
        for s in subjects
    ]
    class_json = [{"id": c.id, "name": c.name, "grade": c.grade_level} for c in classes]
    tchr_json  = [
        {"id": t.id, "name": t.name,
         "subjects": [ts.subject.name for ts in t.teacher_subjects]}
        for t in teachers
    ]

    prompt = f"""You are a school timetable generator for {cfg.SCHOOL_NAME}.
School days: {cfg.SCHOOL_DAYS}
Periods per day: {cfg.PERIODS_PER_DAY}

Available subjects: {json.dumps(subj_json, indent=2)}
Available classes: {json.dumps(class_json, indent=2)}
Teachers: {json.dumps(tchr_json, indent=2)}

Admin request: {req.prompt}

Generate a complete, conflict-free timetable schedule.
Return ONLY a JSON array of slot objects — no explanation, no markdown, just JSON:
[
  {{"class_name": "7A", "subject_name": "Mathematics", "teacher_name": "Mrs Alice", "day": "Monday", "period": 1}},
  ...
]
Rules:
- Each subject gets exactly its weekly_periods slots per class per week
- No teacher teaches two classes at the same time
- No class has the same subject twice in one day (unless weekly_periods > 5)
- Distribute subjects evenly across the week
"""

    try:
        response = model.generate_content(prompt)
        raw      = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        if raw.endswith("```"):
            raw = raw[:-3].strip()

        slots = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON. Try rephrasing your request.")
    except Exception as e:
        raise HTTPException(502, f"AI generation failed: {e}")

    return {
        "prompt":       req.prompt,
        "slots":        slots,
        "slot_count":   len(slots),
        "message":      f"AI generated {len(slots)} schedule slots. Review and apply below.",
    }


@router.post("/ai/optimize-exam")
def ai_optimize_exam(
    req: AIGenerateRequest,
    db:  Session = Depends(get_db),
    _:   User    = Depends(get_current_user),
):
    """
    Use AI to suggest an optimized exam schedule.
    Considers paper duration, class count, and teacher availability.

    Example prompts:
      "Plan a 2-week exam schedule for Grade 7 and 8"
      "Ensure Science practicals are on separate days from theory papers"
      "Space out Maths exams so students have at least one day gap"
    """
    model   = _get_model()
    cfg     = get_settings()

    papers   = db.query(ExamPaper).all()
    classes  = db.query(ClassSection).all()
    teachers = db.query(Teacher).all()

    paper_json = [
        {"subject": p.subject.name, "paper_number": p.paper_number,
         "duration_minutes": p.duration_minutes, "is_practical": p.is_practical}
        for p in papers
    ]
    class_names = [c.name for c in classes]

    prompt = f"""You are an exam scheduler for {cfg.SCHOOL_NAME}.
School days: {cfg.SCHOOL_DAYS}
Periods per day: {cfg.PERIODS_PER_DAY}

Exam papers to schedule: {json.dumps(paper_json, indent=2)}
Classes sitting exams: {class_names}

Admin request: {req.prompt}

Generate an optimized exam timetable.
Return ONLY a JSON array — no explanation, no markdown:
[
  {{"subject": "Mathematics", "paper_number": 1, "class_name": "7A", "day": "Monday", "period": 1}},
  ...
]
Rules:
- No class has more than 1 exam per day
- Practical papers need a dedicated period (double = 2 periods)
- Space high-workload subjects (Maths, Science) across the exam period
- Return one entry per (paper × class) combination
"""

    try:
        response = model.generate_content(prompt)
        raw      = response.text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        slots    = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(502, "AI returned invalid JSON. Try rephrasing your prompt.")
    except Exception as e:
        raise HTTPException(502, f"AI exam optimization failed: {e}")

    return {
        "prompt":     req.prompt,
        "slots":      slots,
        "slot_count": len(slots),
        "message":    f"AI suggested {len(slots)} exam slots. Review before applying.",
    }


@router.get("/ai/status")
def ai_status(_: User = Depends(get_current_user)):
    """Check if AI assistant is configured and available."""
    cfg = get_settings()
    configured = bool(cfg.GEMINI_API_KEY)
    return {
        "configured": configured,
        "model":      "gemini-2.0-flash" if configured else None,
        "free_tier":  "15 req/min, 1M tokens/day",
        "get_key_url": "https://aistudio.google.com/app/apikey",
        "message": (
            "AI assistant is ready" if configured
            else "Set GEMINI_API_KEY environment variable to enable AI features"
        ),
    }
