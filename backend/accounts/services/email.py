import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------
def _frontend_base_url():
    return getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")


def _from_email():
    return getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@athlon.local")


def _from_name():
    return getattr(settings, "DEFAULT_FROM_NAME", "Athlon")


def _expiry_display():
    seconds = int(getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 60 * 60 * 24 * 3))
    days = seconds // 86400
    if days >= 1:
        return f"{days} day{'s' if days != 1 else ''}"
    hours = max(1, seconds // 3600)
    return f"{hours} hour{'s' if hours != 1 else ''}"


# ---------------------------------------------------------------------------
# Brevo HTTP delivery
# ---------------------------------------------------------------------------
def _send_via_brevo(to_email, to_name, subject, html_content, text_content=None):
    """
    Send a transactional email through Brevo's HTTP API.

    Returns True on success, False on failure.

    If BREVO_API_KEY is not set, logs the email to the console instead of
    sending — this keeps local development working without credentials.
    """
    api_key = getattr(settings, "BREVO_API_KEY", "") or ""

    # Dev fallback: no credentials configured -> print instead of sending.
    if not api_key:
        logger.info(
            "[DEV EMAIL] BREVO_API_KEY not set — printing instead of sending\n"
            "To: %s\nSubject: %s\nBody:\n%s",
            to_email,
            subject,
            html_content,
        )
        return True

    payload = {
        "sender": {"name": _from_name(), "email": _from_email()},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content

    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json",
    }

    try:
        response = requests.post(
            BREVO_API_URL,
            json=payload,
            headers=headers,
            timeout=int(getattr(settings, "BREVO_API_TIMEOUT", 15)),
        )
    except requests.RequestException:
        logger.exception("Brevo API request failed for %s", to_email)
        return False

    if response.status_code in (200, 201, 202):
        logger.info(
            "Brevo API: email sent to %s (status %s)", to_email, response.status_code
        )
        return True

    logger.error(
        "Brevo API error %s sending to %s: %s",
        response.status_code,
        to_email,
        response.text,
    )
    return False


# ---------------------------------------------------------------------------
# HTML / text builders
# ---------------------------------------------------------------------------
def _verification_html(user, link, expiry):
    greeting = user.display_name or user.email
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; line-height:1.5;">
    <h2 style="margin:0 0 12px;">Welcome to Athlon</h2>
    <p>Hi {greeting},</p>
    <p>Please confirm your email address to activate your Athlon account.</p>
    <p style="margin:24px 0;">
      <a href="{link}"
         style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;
                text-decoration:none;display:inline-block;">Verify email</a>
    </p>
    <p style="font-size:13px;color:#555;">
      Or paste this link into your browser:<br>
      <a href="{link}">{link}</a>
    </p>
    <p style="font-size:13px;color:#555;">This link expires in {expiry}.</p>
    <p style="font-size:13px;color:#555;">
      If you didn't create an Athlon account, you can safely ignore this email.
    </p>
    <p style="font-size:13px;color:#555;">— The Athlon team</p>
  </body>
</html>
"""


def _verification_text(user, link, expiry):
    greeting = user.display_name or user.email
    return (
        f"Hi {greeting},\n\n"
        "Welcome to Athlon.\n\n"
        "Please confirm your email address by opening the link below:\n\n"
        f"{link}\n\n"
        f"This link expires in {expiry}. If you didn't create an Athlon "
        "account, you can safely ignore this email.\n\n"
        "— The Athlon team\n"
    )


def _reset_html(user, link):
    greeting = user.display_name or user.email
    return f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; line-height:1.5;">
    <h2 style="margin:0 0 12px;">Reset your Athlon password</h2>
    <p>Hi {greeting},</p>
    <p>You (or someone using your email) requested a password reset for your
       Athlon account.</p>
    <p style="margin:24px 0;">
      <a href="{link}"
         style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;
                text-decoration:none;display:inline-block;">Reset password</a>
    </p>
    <p style="font-size:13px;color:#555;">
      Or paste this link into your browser:<br>
      <a href="{link}">{link}</a>
    </p>
    <p style="font-size:13px;color:#555;">
      If you didn't request this, you can ignore this email — your password
      will remain unchanged.
    </p>
  </body>
</html>
"""


def _reset_text(user, link):
    return (
        f"Hi {user.display_name or user.email},\n\n"
        "You (or someone using your email) requested a password reset for "
        f"your Athlon account. Use the link below to set a new password:\n\n"
        f"{link}\n\n"
        "If you didn't request this, you can ignore this email — your password "
        "will remain unchanged."
    )


# ---------------------------------------------------------------------------
# Public API (signatures unchanged — views keep working)
# ---------------------------------------------------------------------------
def send_verification_email(user, token):
    """
    Send the account verification email.

    Raises RuntimeError if Brevo delivery fails, so the caller can log and
    swallow (preserving enumeration-safe behaviour in the views).
    """
    link = f"{_frontend_base_url()}/verify-email/{token}"
    expiry = _expiry_display()

    ok = _send_via_brevo(
        to_email=user.email,
        to_name=user.display_name or user.get_full_name() or user.email,
        subject="Verify your Athlon email",
        html_content=_verification_html(user, link, expiry),
        text_content=_verification_text(user, link, expiry),
    )
    if not ok:
        raise RuntimeError("Brevo API returned failure for verification email")


def send_password_reset_email(user, uidb64, token):
    """
    Send the password reset email.
    """
    link = f"{_frontend_base_url()}/reset-password?uid={uidb64}&token={token}"

    ok = _send_via_brevo(
        to_email=user.email,
        to_name=user.display_name or user.get_full_name() or user.email,
        subject="Reset your Athlon password",
        html_content=_reset_html(user, link),
        text_content=_reset_text(user, link),
    )
    if not ok:
        raise RuntimeError("Brevo API returned failure for password reset email")