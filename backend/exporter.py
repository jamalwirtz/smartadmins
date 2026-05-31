"""SSTG – PDF Export Service using ReportLab."""
from collections import defaultdict
from io import BytesIO
from typing import Dict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import get_settings
from models import ClassSection, Subject, Teacher, TimetableDraft, TimetableSlot

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    RL = True
except ImportError:
    RL = False

cfg = get_settings()


# ── PDF Themes ─────────────────────────────────────────────────────────────────
PDF_THEMES = {
    "navy": {
        "header_bg":"#1A237E","header_fg":"#FFFFFF",
        "row_a":"#FFFFFF",    "row_b":"#E8EAF6",
        "grid":"#9FA8DA",     "title":"#1A237E","accent":"#3949AB",
    },
    "green": {
        "header_bg":"#1B5E20","header_fg":"#FFFFFF",
        "row_a":"#FFFFFF",    "row_b":"#E8F5E9",
        "grid":"#A5D6A7",     "title":"#1B5E20","accent":"#388E3C",
    },
    "amber": {
        "header_bg":"#E65100","header_fg":"#FFFFFF",
        "row_a":"#FFFFFF",    "row_b":"#FFF3E0",
        "grid":"#FFCC80",     "title":"#BF360C","accent":"#FB8C00",
    },
    "rose": {
        "header_bg":"#880E4F","header_fg":"#FFFFFF",
        "row_a":"#FFFFFF",    "row_b":"#FCE4EC",
        "grid":"#F48FB1",     "title":"#880E4F","accent":"#C2185B",
    },
    "slate": {
        "header_bg":"#263238","header_fg":"#FFFFFF",
        "row_a":"#FFFFFF",    "row_b":"#ECEFF1",
        "grid":"#B0BEC5",     "title":"#263238","accent":"#455A64",
    },
}


class PDFExporter:

    def _check(self):
        if not RL:
            raise HTTPException(503, "reportlab not installed. Run: pip install reportlab")

    def _theme(self, db=None) -> dict:
        name = "navy"
        if db:
            try:
                from models import SchoolSettings
                s = db.query(SchoolSettings).first()
                if s and s.timetable_theme:
                    name = s.timetable_theme
            except Exception:
                pass
        return PDF_THEMES.get(name, PDF_THEMES["navy"])

    def _school_info(self, db=None) -> dict:
        info = {"name": cfg.SCHOOL_NAME, "year": cfg.ACADEMIC_YEAR,
                "motto": "", "badge_b64": None, "badge_mime": None}
        if db:
            try:
                from models import SchoolSettings
                s = db.query(SchoolSettings).first()
                if s:
                    info.update({
                        "name":      s.school_name or cfg.SCHOOL_NAME,
                        "year":      s.academic_year or cfg.ACADEMIC_YEAR,
                        "motto":     s.school_motto or "",
                        "badge_b64": s.badge_data,
                        "badge_mime":s.badge_mime,
                    })
            except Exception:
                pass
        return info

    def _time_labels(self, db=None) -> dict:
        labels = {}
        if not db: return labels
        try:
            from models import SchoolSettings
            s = db.query(SchoolSettings).first()
            if not s: return labels
            h, m = map(int, s.start_time.split(":"))
            cur  = h*60+m
            for p in range(1, s.periods_per_day+1):
                st = f"{cur//60:02d}:{cur%60:02d}"; cur += s.period_minutes
                en = f"{cur//60:02d}:{cur%60:02d}"
                labels[p] = f"{st}\u2013{en}"
                if p == s.break_after_period:  cur += s.break_minutes
                if p == s.lunch_after_period:  cur += s.lunch_minutes
        except Exception:
            pass
        return labels

    def _header(self, story, title: str, db=None):
        import base64 as _b64
        from reportlab.platypus import HRFlowable
        school = self._school_info(db)
        theme  = self._theme(db)
        styles = getSampleStyleSheet()
        TS = ParagraphStyle("T", parent=styles["Title"], fontSize=16,
                             textColor=colors.HexColor(theme["title"]),
                             fontName="Helvetica-Bold", spaceAfter=2)
        SS = ParagraphStyle("S", parent=styles["Normal"], fontSize=9,
                             textColor=colors.grey, spaceAfter=2)
        MS = ParagraphStyle("M", parent=styles["Normal"], fontSize=9,
                             textColor=colors.HexColor(theme["accent"]),
                             fontName="Helvetica-Oblique", spaceAfter=6)

        if school["badge_b64"]:
            try:
                from io import BytesIO as BIO
                from reportlab.platypus import Image as RLImg
                badge = RLImg(BIO(_b64.b64decode(school["badge_b64"])),
                              width=1.8*cm, height=1.8*cm)
                tbl = Table([[badge, [
                    Paragraph(school["name"], TS),
                    Paragraph(f"{title}  |  {school['year']}", SS),
                ]]], colWidths=[2.2*cm, None])
                tbl.setStyle(TableStyle([
                    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                    ("LEFTPADDING",(0,0),(0,0),0),
                    ("RIGHTPADDING",(0,0),(0,0),8),
                ]))
                story.append(tbl)
            except Exception:
                story.append(Paragraph(school["name"], TS))
                story.append(Paragraph(f"{title} | {school['year']}", SS))
        else:
            story.append(Paragraph(school["name"], TS))
            story.append(Paragraph(f"{title}  |  Academic Year: {school['year']}", SS))

        if school["motto"]:
            story.append(Paragraph(f"\u201c{school['motto']}\u201d", MS))
        story.append(HRFlowable(width="100%", thickness=1.5,
                                  color=colors.HexColor(theme["header_bg"]),spaceAfter=8))

    def _tbl_style(self, theme: dict) -> TableStyle:
        return TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  colors.HexColor(theme["header_bg"])),
            ("TEXTCOLOR",     (0,0),(-1,0),  colors.HexColor(theme["header_fg"])),
            ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0,0),(-1,0),  9),
            ("FONTSIZE",      (0,1),(-1,-1), 8),
            ("ALIGN",         (0,0),(-1,-1), "CENTER"),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
            ("GRID",          (0,0),(-1,-1), 0.4, colors.HexColor(theme["grid"])),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [
                colors.HexColor(theme["row_a"]), colors.HexColor(theme["row_b"])
            ]),
            ("TOPPADDING",    (0,0),(-1,-1), 5),
            ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ])

    def full_draft_pdf(self, draft, db: Session) -> bytes:
        self._check()
        buf   = BytesIO()
        doc   = SimpleDocTemplate(buf, pagesize=landscape(A4),
                                   leftMargin=1*cm, rightMargin=1*cm,
                                   topMargin=1.5*cm, bottomMargin=1.5*cm)
        story  = []
        theme  = self._theme(db)
        tlabels= self._time_labels(db)
        self._header(story, draft.name, db)

        days    = cfg.school_days_list
        periods = list(range(1, cfg.PERIODS_PER_DAY + 1))
        slots   = db.query(TimetableSlot).filter(TimetableSlot.draft_id == draft.id).all()
        subj_map = {s.id: s for s in db.query(Subject).all()}
        tchr_map = {t.id: t for t in db.query(Teacher).all()}
        slot_idx = defaultdict(dict)
        for s in slots:
            slot_idx[s.class_id][(s.day, s.period)] = s

        styles = getSampleStyleSheet()
        for cls in db.query(ClassSection).all():
            story.append(Paragraph(
                f"Class {cls.name}  ·  Grade {cls.grade_level}",
                ParagraphStyle("CH", parent=styles["Heading2"],
                               textColor=colors.HexColor(theme["title"]),
                               spaceAfter=4, spaceBefore=12)))
            header = ["Period / Time"] + days
            rows = [header]
            for p in periods:
                lbl = tlabels.get(p, "")
                row = [f"P{p}\n{lbl}" if lbl else str(p)]
                for d in days:
                    sl = slot_idx[cls.id].get((d, p))
                    if sl and sl.subject_id:
                        subj = subj_map.get(sl.subject_id)
                        tchr = tchr_map.get(sl.teacher_id) if sl.teacher_id else None
                        row.append(f"{subj.name if subj else "?"}"
                                   f"\n{tchr.name.split()[0] if tchr else ""}")
                    else:
                        row.append("")
                rows.append(row)

            cw = [2.2*cm] + [3.0*cm]*len(days)
            tbl = Table(rows, colWidths=cw, repeatRows=1)
            tbl.setStyle(self._tbl_style(theme))
            story.append(tbl)
            story.append(Spacer(1, 0.6*cm))

        doc.build(story)
        return buf.getvalue()

    def teacher_pdf(self, teacher, draft, db: Session) -> bytes:
        self._check()
        buf   = BytesIO()
        doc   = SimpleDocTemplate(buf, pagesize=A4,
                                   leftMargin=1.5*cm, rightMargin=1.5*cm,
                                   topMargin=1.5*cm, bottomMargin=1.5*cm)
        story  = []
        theme  = self._theme(db)
        tlabels= self._time_labels(db)
        self._header(story, f"Teacher Schedule — {teacher.name}", db)

        days    = cfg.school_days_list
        periods = list(range(1, cfg.PERIODS_PER_DAY + 1))
        slots   = (db.query(TimetableSlot)
                   .filter(TimetableSlot.draft_id   == draft.id,
                           TimetableSlot.teacher_id == teacher.id).all())
        subj_map = {s.id: s for s in db.query(Subject).all()}
        cls_map  = {c.id: c for c in db.query(ClassSection).all()}
        slot_idx = defaultdict(dict)
        for s in slots:
            slot_idx[s.day][s.period] = s

        styles = getSampleStyleSheet()
        header = ["Period / Time"] + days
        rows   = [header]
        for p in periods:
            lbl = tlabels.get(p, "")
            row = [f"P{p}\n{lbl}" if lbl else str(p)]
            for d in days:
                sl = slot_idx[d].get(p)
                if sl:
                    subj = subj_map.get(sl.subject_id)
                    cls  = cls_map.get(sl.class_id)
                    row.append(f"{subj.name if subj else "?"}\n{cls.name if cls else ""}")
                else:
                    row.append("")
            rows.append(row)

        cw  = [2.2*cm] + [2.8*cm]*len(days)
        tbl = Table(rows, colWidths=cw, repeatRows=1)
        tbl.setStyle(self._tbl_style(theme))
        story.append(tbl)
        story.append(Spacer(1, 0.5*cm))
        story.append(Paragraph(
            f"Periods/week: {len(slots)}  ·  Max: {teacher.max_weekly_hours}",
            ParagraphStyle("F", parent=styles["Normal"], fontSize=8, textColor=colors.grey)))
        doc.build(story)
        return buf.getvalue()

_NAVY   = "1A237E"
_TEAL   = "004D40"
_AMBER  = "F59E0B"
_WHITE  = "FFFFFF"
_GREY_L = "F3F4F6"
_GREY_B = "E5E7EB"
_EXAM_H = "1E3A5F"

def _thin_border():
    s = Side(style="thin", color="CCCCCC")
    return Border(left=s, right=s, top=s, bottom=s)


class ExcelExporter:

    def _check(self):
        if not XLSX:
            from fastapi import HTTPException
            raise HTTPException(503, "openpyxl not installed. Run: pip install openpyxl")

    # ── Timetable → Excel ─────────────────────────────────────────────────────

    def timetable_xlsx(self, draft, db: Session) -> bytes:
        self._check()
        from models import ClassSection, Subject, Teacher, TimetableSlot
        from config import get_settings
        cfg = get_settings()

        wb  = openpyxl.Workbook()
        wb.remove(wb.active)                          # remove default sheet

        days    = cfg.school_days_list
        periods = list(range(1, cfg.PERIODS_PER_DAY + 1))

        slots    = db.query(TimetableSlot).filter(TimetableSlot.draft_id == draft.id).all()
        subj_map = {s.id: s for s in db.query(Subject).all()}
        tchr_map = {t.id: t for t in db.query(Teacher).all()}
        classes  = db.query(ClassSection).order_by(ClassSection.grade_level, ClassSection.name).all()

        # ── Summary sheet ─────────────────────────────────────────────────────
        ws_sum = wb.create_sheet("Summary")
        ws_sum["A1"] = cfg.SCHOOL_NAME
        ws_sum["A1"].font = Font(bold=True, size=16, color=_NAVY)
        ws_sum["A2"] = f"Timetable: {draft.name}   |   Academic Year: {cfg.ACADEMIC_YEAR}"
        ws_sum["A2"].font = Font(italic=True, size=11, color="555555")
        ws_sum.merge_cells("A1:G1"); ws_sum.merge_cells("A2:G2")

        headers = ["Class", "Grade", "Slots Filled", "Total Periods", "Fill %"]
        for ci, h in enumerate(headers, 1):
            c = ws_sum.cell(row=4, column=ci, value=h)
            c.font      = Font(bold=True, color=_WHITE)
            c.fill      = PatternFill("solid", fgColor=_NAVY)
            c.alignment = Alignment(horizontal="center")

        slot_idx: dict = defaultdict(dict)
        for s in slots:
            slot_idx[s.class_id][(s.day, s.period)] = s

        total_possible = len(days) * len(periods)
        for ri, cls in enumerate(classes, 5):
            filled = sum(
                1 for d in days for p in periods
                if slot_idx[cls.id].get((d, p)) and slot_idx[cls.id][(d, p)].subject_id
            )
            pct = round(filled / total_possible * 100) if total_possible else 0
            row = [cls.name, cls.grade_level, filled, total_possible, f"{pct}%"]
            for ci, val in enumerate(row, 1):
                c = ws_sum.cell(row=ri, column=ci, value=val)
                c.alignment = Alignment(horizontal="center")
                c.border    = _thin_border()
                if ri % 2 == 0:
                    c.fill = PatternFill("solid", fgColor=_GREY_L)

        ws_sum.column_dimensions["A"].width = 14
        ws_sum.column_dimensions["B"].width = 10
        ws_sum.column_dimensions["C"].width = 14
        ws_sum.column_dimensions["D"].width = 14
        ws_sum.column_dimensions["E"].width = 10

        # ── One sheet per class ───────────────────────────────────────────────
        for cls in classes:
            ws = wb.create_sheet(f"Class {cls.name}")
            ws["A1"] = f"{cfg.SCHOOL_NAME} — Class {cls.name} (Grade {cls.grade_level})"
            ws["A1"].font = Font(bold=True, size=13, color=_NAVY)
            ws.merge_cells(f"A1:{get_column_letter(len(days)+1)}1")

            # Header row
            ws.cell(row=3, column=1, value="Period").font = Font(bold=True)
            for ci, day in enumerate(days, 2):
                c = ws.cell(row=3, column=ci, value=day)
                c.font      = Font(bold=True, color=_WHITE)
                c.fill      = PatternFill("solid", fgColor=_NAVY)
                c.alignment = Alignment(horizontal="center")
                c.border    = _thin_border()

            for ri, period in enumerate(periods, 4):
                ws.cell(row=ri, column=1, value=f"P{period}").font = Font(bold=True)
                for ci, day in enumerate(days, 2):
                    slot = slot_idx[cls.id].get((day, period))
                    if slot and slot.subject_id:
                        subj = subj_map.get(slot.subject_id)
                        tchr = tchr_map.get(slot.teacher_id) if slot.teacher_id else None
                        text = subj.name if subj else "?"
                        note = tchr.name.split()[0] if tchr else ""
                        c = ws.cell(row=ri, column=ci, value=f"{text}\n{note}")
                        if subj and subj.color_hex:
                            hex_col = subj.color_hex.lstrip("#")
                            try:
                                c.fill = PatternFill("solid", fgColor=hex_col)
                                r_int  = int(hex_col[:2], 16)
                                c.font = Font(
                                    size=9,
                                    color=_WHITE if r_int < 128 else "222222"
                                )
                            except Exception:
                                pass
                    else:
                        c = ws.cell(row=ri, column=ci, value="")
                        c.fill = PatternFill("solid", fgColor=_GREY_L if ri % 2 == 0 else _WHITE)

                    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                    c.border    = _thin_border()

            # Column widths
            ws.column_dimensions["A"].width = 8
            for ci in range(2, len(days) + 2):
                ws.column_dimensions[get_column_letter(ci)].width = 18
            for ri in range(4, 4 + len(periods)):
                ws.row_dimensions[ri].height = 36

        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()

    # ── Exam schedule → PDF ───────────────────────────────────────────────────

    def exam_pdf(self, session, db: Session) -> bytes:
        if not RL:
            from fastapi import HTTPException
            raise HTTPException(503, "reportlab not installed")
        from models import ExamSlot
        from config import get_settings
        cfg = get_settings()

        buf  = BytesIO()
        doc  = SimpleDocTemplate(buf, pagesize=landscape(A4),
                                  leftMargin=1*cm, rightMargin=1*cm,
                                  topMargin=1.5*cm, bottomMargin=1.5*cm)
        story = []
        styles = getSampleStyleSheet()

        # Header
        title_style = ParagraphStyle("T", parent=styles["Title"], fontSize=16,
                                      textColor=colors.HexColor("#1E3A5F"), spaceAfter=2)
        sub_style   = ParagraphStyle("S", parent=styles["Normal"], fontSize=9,
                                      textColor=colors.grey, spaceAfter=8)
        story.append(Paragraph(cfg.SCHOOL_NAME, title_style))
        story.append(Paragraph(
            f"Exam Timetable: {session.name}  |  "
            f"{session.start_date} to {session.end_date}  |  "
            f"Academic Year: {cfg.ACADEMIC_YEAR}",
            sub_style,
        ))
        story.append(Spacer(1, 0.3*cm))

        slots = (
            db.query(ExamSlot)
            .filter(ExamSlot.exam_session_id == session.id)
            .order_by(ExamSlot.day, ExamSlot.period)
            .all()
        )

        if not slots:
            story.append(Paragraph("No exam slots scheduled yet.", styles["Normal"]))
            doc.build(story)
            return buf.getvalue()

        # Group by day
        from collections import defaultdict as dd
        by_day = dd(list)
        day_order = ["Monday","Tuesday","Wednesday","Thursday","Friday"]
        for sl in slots:
            by_day[sl.day].append(sl)

        for day in day_order:
            day_slots = sorted(by_day.get(day, []), key=lambda s: s.period)
            if not day_slots:
                continue

            story.append(Paragraph(day, ParagraphStyle("D", parent=styles["Heading2"],
                                                         textColor=colors.HexColor("#1E3A5F"),
                                                         spaceAfter=4, spaceBefore=10)))
            header = ["Period","Subject","Paper","Class","Duration","Invigilator","Room"]
            rows   = [header]
            for sl in day_slots:
                rows.append([
                    str(sl.period),
                    sl.paper.subject.name,
                    f"Paper {sl.paper.paper_number}{'*' if sl.paper.is_practical else ''}",
                    sl.class_section.name,
                    f"{sl.paper.duration_minutes} min",
                    sl.invigilator.name if sl.invigilator else "—",
                    sl.room or "—",
                ])

            col_w = [1.2*cm, 4.5*cm, 2.2*cm, 2.2*cm, 2.2*cm, 5*cm, 3.5*cm]
            tbl   = Table(rows, colWidths=col_w, repeatRows=1)
            tbl.setStyle(TableStyle([
                ("BACKGROUND",   (0,0),(-1,0),  colors.HexColor("#1E3A5F")),
                ("TEXTCOLOR",    (0,0),(-1,0),  colors.white),
                ("FONTNAME",     (0,0),(-1,0),  "Helvetica-Bold"),
                ("FONTSIZE",     (0,0),(-1,0),  8),
                ("FONTSIZE",     (0,1),(-1,-1), 8),
                ("ALIGN",        (0,0),(-1,-1), "CENTER"),
                ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
                ("GRID",         (0,0),(-1,-1), 0.4, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#EFF6FF")]),
                ("TOPPADDING",   (0,0),(-1,-1), 5),
                ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.4*cm))

        story.append(Paragraph("* Practical paper", styles["Normal"]))
        doc.build(story)
        return buf.getvalue()

    # ── Exam schedule → Excel ─────────────────────────────────────────────────

    def exam_xlsx(self, session, db: Session) -> bytes:
        self._check()
        from models import ExamSlot
        from config import get_settings
        from collections import defaultdict as dd
        cfg = get_settings()

        wb  = openpyxl.Workbook()
        wb.remove(wb.active)

        slots = (
            db.query(ExamSlot)
            .filter(ExamSlot.exam_session_id == session.id)
            .order_by(ExamSlot.day, ExamSlot.period)
            .all()
        )

        day_order = ["Monday","Tuesday","Wednesday","Thursday","Friday"]

        # ── Overview sheet ────────────────────────────────────────────────────
        ws_ov = wb.create_sheet("Overview")
        ws_ov["A1"] = cfg.SCHOOL_NAME
        ws_ov["A1"].font = Font(bold=True, size=16, color=_EXAM_H)
        ws_ov["A2"] = f"Exam Session: {session.name}   |   {session.start_date} → {session.end_date}"
        ws_ov["A2"].font = Font(italic=True, size=11, color="555555")
        ws_ov.merge_cells("A1:H1"); ws_ov.merge_cells("A2:H2")

        ov_headers = ["Day","Period","Subject","Paper","Class","Duration (min)","Invigilator","Room"]
        for ci, h in enumerate(ov_headers, 1):
            c = ws_ov.cell(row=4, column=ci, value=h)
            c.font      = Font(bold=True, color=_WHITE)
            c.fill      = PatternFill("solid", fgColor=_EXAM_H)
            c.alignment = Alignment(horizontal="center")
            c.border    = _thin_border()

        for ri, sl in enumerate(slots, 5):
            row = [
                sl.day,
                sl.period,
                sl.paper.subject.name,
                f"Paper {sl.paper.paper_number}",
                sl.class_section.name,
                sl.paper.duration_minutes,
                sl.invigilator.name if sl.invigilator else "",
                sl.room or "",
            ]
            for ci, val in enumerate(row, 1):
                c = ws_ov.cell(row=ri, column=ci, value=val)
                c.alignment = Alignment(horizontal="center")
                c.border    = _thin_border()
                if ri % 2 == 0:
                    c.fill = PatternFill("solid", fgColor=_GREY_L)

        widths = [13,9,18,12,10,16,22,16]
        for ci, w in enumerate(widths, 1):
            ws_ov.column_dimensions[get_column_letter(ci)].width = w

        # ── One sheet per day ─────────────────────────────────────────────────
        by_day = dd(list)
        for sl in slots:
            by_day[sl.day].append(sl)

        for day in day_order:
            day_slots = sorted(by_day.get(day, []), key=lambda s: s.period)
            if not day_slots:
                continue

            ws = wb.create_sheet(day)
            ws["A1"] = f"{session.name} — {day}"
            ws["A1"].font = Font(bold=True, size=13, color=_EXAM_H)
            ws.merge_cells("A1:H1")

            headers = ["Period","Subject","Paper","Class","Duration","Invigilator","Room","Notes"]
            for ci, h in enumerate(headers, 1):
                c = ws.cell(row=3, column=ci, value=h)
                c.font      = Font(bold=True, color=_WHITE)
                c.fill      = PatternFill("solid", fgColor=_EXAM_H)
                c.alignment = Alignment(horizontal="center")
                c.border    = _thin_border()

            for ri, sl in enumerate(day_slots, 4):
                row = [
                    sl.period,
                    sl.paper.subject.name,
                    f"Paper {sl.paper.paper_number}{'  (Practical)' if sl.paper.is_practical else ''}",
                    sl.class_section.name,
                    f"{sl.paper.duration_minutes} min",
                    sl.invigilator.name if sl.invigilator else "",
                    sl.room or "",
                    sl.notes or "",
                ]
                for ci, val in enumerate(row, 1):
                    c = ws.cell(row=ri, column=ci, value=val)
                    c.alignment = Alignment(horizontal="center", vertical="center")
                    c.border    = _thin_border()
                    if ri % 2 == 0:
                        c.fill = PatternFill("solid", fgColor="EFF6FF")
                ws.row_dimensions[ri].height = 22

            day_widths = [9,20,20,12,14,22,16,20]
            for ci, w in enumerate(day_widths, 1):
                ws.column_dimensions[get_column_letter(ci)].width = w

        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()
