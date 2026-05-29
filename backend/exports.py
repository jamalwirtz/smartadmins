"""SSTG – Export (PDF) and Email routes."""
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Teacher, TimetableDraft
from schemas import EmailScheduleRequest
from exporter import PDFExporter
from email_service import EmailService
from security import get_current_user, require_admin

router = APIRouter()
exporter = PDFExporter()
mailer = EmailService()


@router.get("/draft/{draft_id}/pdf")
def export_draft_pdf(draft_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    pdf = exporter.full_draft_pdf(draft, db)
    safe_name = draft.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="timetable_{safe_name}.pdf"'},
    )


@router.get("/teacher/{teacher_id}/pdf")
def export_teacher_pdf(teacher_id: str, draft_id: str,
                       db: Session = Depends(get_db), _=Depends(get_current_user)):
    teacher = db.get(Teacher, teacher_id)
    draft = db.get(TimetableDraft, draft_id)
    if not teacher or not draft:
        raise HTTPException(404, "Teacher or draft not found")
    pdf = exporter.teacher_pdf(teacher, draft, db)
    safe_name = teacher.name.replace(" ", "_")
    return StreamingResponse(
        BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="schedule_{safe_name}.pdf"'},
    )


@router.post("/email/teacher")
def email_teacher(req: EmailScheduleRequest, db: Session = Depends(get_db), _=Depends(require_admin)):
    teacher = db.get(Teacher, req.teacher_id)
    draft = db.get(TimetableDraft, req.draft_id)
    if not teacher or not draft:
        raise HTTPException(404, "Teacher or draft not found")
    if not teacher.email:
        raise HTTPException(422, "Teacher has no email address on record")
    pdf = exporter.teacher_pdf(teacher, draft, db)
    mailer.send_teacher_schedule(
        teacher_email=teacher.email,
        teacher_name=teacher.name,
        pdf_bytes=pdf,
        custom_message=req.custom_message or "",
    )
    return {"message": f"Schedule emailed to {teacher.email}"}


# ── new exporter instance ──────────────────────────────────────────────────────
from exporter import ExcelExporter
from models import ExamSession
xlsx_exporter = ExcelExporter()


@router.get("/draft/{draft_id}/xlsx")
def export_draft_xlsx(draft_id: str, db: Session = Depends(get_db),
                      _=Depends(get_current_user)):
    """Export a timetable draft as a multi-sheet Excel file."""
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    data = xlsx_exporter.timetable_xlsx(draft, db)
    safe = draft.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="timetable_{safe}.xlsx"'},
    )


@router.get("/exam/{session_id}/pdf")
def export_exam_pdf(session_id: str, db: Session = Depends(get_db),
                    _=Depends(get_current_user)):
    """Export an exam session as a printable PDF."""
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Exam session not found")
    data = xlsx_exporter.exam_pdf(session, db)
    safe = session.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(data), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="exam_{safe}.pdf"'},
    )


@router.get("/exam/{session_id}/xlsx")
def export_exam_xlsx(session_id: str, db: Session = Depends(get_db),
                     _=Depends(get_current_user)):
    """Export an exam session as a multi-sheet Excel file."""
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Exam session not found")
    data = xlsx_exporter.exam_xlsx(session, db)
    safe = session.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="exam_{safe}.xlsx"'},
    )
