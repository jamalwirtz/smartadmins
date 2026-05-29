"""SSTG – Email Service (SMTP)."""
import smtplib
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import HTTPException
from config import get_settings

cfg = get_settings()


class EmailService:

    def send_teacher_schedule(
        self,
        teacher_email: str,
        teacher_name: str,
        pdf_bytes: bytes,
        custom_message: str = "",
    ) -> bool:
        if not cfg.SMTP_USER or not cfg.SMTP_PASSWORD:
            raise HTTPException(503, "SMTP not configured — set SMTP_USER and SMTP_PASSWORD in .env")

        msg = MIMEMultipart()
        msg["From"] = f"{cfg.EMAIL_FROM_NAME} <{cfg.EMAIL_FROM or cfg.SMTP_USER}>"
        msg["To"] = teacher_email
        msg["Subject"] = f"Your Weekly Timetable — {cfg.ACADEMIC_YEAR}"

        body = (
            f"Dear {teacher_name},\n\n"
            f"Please find attached your weekly timetable for Academic Year {cfg.ACADEMIC_YEAR}.\n\n"
            f"{custom_message or 'If you have any questions please contact the school administration.'}\n\n"
            f"Regards,\n{cfg.SCHOOL_NAME} Administration\n"
        )
        msg.attach(MIMEText(body, "plain"))

        part = MIMEBase("application", "octet-stream")
        part.set_payload(pdf_bytes)
        encoders.encode_base64(part)
        safe_name = teacher_name.replace(" ", "_")
        part.add_header("Content-Disposition", f'attachment; filename="schedule_{safe_name}.pdf"')
        msg.attach(part)

        try:
            with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
                server.sendmail(cfg.SMTP_USER, teacher_email, msg.as_string())
            return True
        except smtplib.SMTPException as exc:
            raise HTTPException(500, detail=f"Email failed: {exc}")
