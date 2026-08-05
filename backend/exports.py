"""SSTG – Export (PDF) and Email routes."""
from io import BytesIO
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import Teacher, TimetableDraft, ExamLayoutTemplate, TimetableLayoutTemplate
from schemas import EmailScheduleRequest
from exporter import PDFExporter
from email_service import EmailService
from security import get_current_user, require_admin

router = APIRouter()
exporter = PDFExporter()
mailer = EmailService()


def _resolve_timetable_layout(draft: TimetableDraft, layout_id: Optional[str], db: Session):
    """Same resolution order as exams: explicit override -> draft's pinned
    template -> org-wide default -> None (caller falls back to the original
    hardcoded format)."""
    if layout_id:
        layout = db.get(TimetableLayoutTemplate, layout_id)
        if not layout:
            raise HTTPException(404, "Layout template not found")
        return layout
    if draft.layout_template_id:
        layout = db.get(TimetableLayoutTemplate, draft.layout_template_id)
        if layout:
            return layout
    return db.query(TimetableLayoutTemplate).filter(
        TimetableLayoutTemplate.is_default == True  # noqa: E712
    ).first()


@router.get("/draft/{draft_id}/pdf")
def export_draft_pdf(
    draft_id: str,
    layout_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Export a timetable draft as PDF. Pass ?layout_id=<id> to use a specific
    TimetableLayoutTemplate; otherwise the draft's pinned template (or the
    org default) is used automatically -- same pattern as exam exports.
    """
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")

    layout = _resolve_timetable_layout(draft, layout_id, db)
    if layout:
        from exporter import ExcelExporter
        pdf = ExcelExporter().full_draft_pdf_layout(draft, db, layout)
    else:
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


# -- new exporter instance ------------------------------------------------------
from exporter import ExcelExporter
from models import ExamSession
xlsx_exporter = ExcelExporter()


def _resolve_exam_layout(session: ExamSession, layout_id: Optional[str], db: Session):
    if layout_id:
        layout = db.get(ExamLayoutTemplate, layout_id)
        if not layout:
            raise HTTPException(404, "Layout template not found")
        return layout
    if session.layout_template_id:
        layout = db.get(ExamLayoutTemplate, session.layout_template_id)
        if layout:
            return layout
    return db.query(ExamLayoutTemplate).filter(
        ExamLayoutTemplate.is_default == True  # noqa: E712
    ).first()


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


@router.get("/draft/{draft_id}/csv")
def export_draft_csv(draft_id: str, db: Session = Depends(get_db),
                     _=Depends(get_current_user)):
    """Export a timetable draft as a flat CSV -- one row per lesson. Useful
    for importing into spreadsheets or other database/scheduling tools."""
    draft = db.get(TimetableDraft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    csv_text = xlsx_exporter.timetable_csv(draft, db)
    safe = draft.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        iter([csv_text]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="timetable_{safe}.csv"'},
    )


@router.get("/exam/{session_id}/pdf")
def export_exam_pdf(
    session_id: str,
    layout_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Export an exam session as a printable PDF.
    Pass ?layout_id=<id> to use a specific ExamLayoutTemplate; otherwise the
    session's pinned template (or the org default) is used automatically.
    """
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Exam session not found")

    layout = _resolve_exam_layout(session, layout_id, db)
    if layout:
        data = xlsx_exporter.exam_pdf_layout(session, db, layout)
    else:
        data = xlsx_exporter.exam_pdf(session, db)

    safe = session.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(data), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="exam_{safe}.pdf"'},
    )


@router.get("/exam/{session_id}/xlsx")
def export_exam_xlsx(
    session_id: str,
    layout_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Export an exam session as a multi-sheet Excel file (layout-aware -- see export_exam_pdf)."""
    session = db.get(ExamSession, session_id)
    if not session:
        raise HTTPException(404, "Exam session not found")

    layout = _resolve_exam_layout(session, layout_id, db)
    if layout:
        data = xlsx_exporter.exam_xlsx_layout(session, db, layout)
    else:
        data = xlsx_exporter.exam_xlsx(session, db)

    safe = session.name.replace(" ", "_").replace("/", "-")
    return StreamingResponse(
        BytesIO(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="exam_{safe}.xlsx"'},
    )
