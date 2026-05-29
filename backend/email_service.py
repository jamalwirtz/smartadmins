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


# ── SendGrid alternative (100 emails/day free) ────────────────────────────────
def send_with_sendgrid(to_email: str, subject: str, html_content: str) -> bool:
    """
    Send email via SendGrid free tier (100 emails/day, no SMTP config needed).
    Get API key at https://sendgrid.com → free account → Settings → API Keys
    Set as environment variable: SENDGRID_API_KEY
    """
    from config import get_settings
    cfg = get_settings()

    if not cfg.SENDGRID_API_KEY:
        return False

    try:
        import httpx
        response = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {cfg.SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": cfg.EMAIL_FROM or "noreply@school.edu",
                         "name": cfg.EMAIL_FROM_NAME},
                "subject": subject,
                "content": [{"type": "text/html", "value": html_content}],
            },
            timeout=15.0,
        )
        return response.status_code in (200, 202)
    except Exception as e:
        print(f"[SendGrid] Error: {e}")
        return False


def send_email_smart(to_email: str, subject: str, html_content: str) -> bool:
    """
    Try SendGrid first (more reliable on Render), fall back to SMTP.
    """
    if send_with_sendgrid(to_email, subject, html_content):
        return True
    # Fall back to SMTP
    try:
        send_email(to_email, subject, html_content)
        return True
    except Exception:
        return False
