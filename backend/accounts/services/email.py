from django.conf import settings
from django.core.mail import send_mail


def _frontend_base_url():
    return getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")


def _from_email():
    return getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@athlon.local")


def send_verification_email(user, token):
    base = _frontend_base_url()
    link = f"{base}/verify-email/{token}"
    subject = "Verify your Athlon email"
    message = (
        f"Hi {user.display_name or user.email},\n\n"
        "Thanks for signing up to Athlon. Please verify your email by "
        f"clicking the link below:\n\n{link}\n\n"
        "If you didn't create an account, you can safely ignore this email."
    )
    send_mail(subject, message, _from_email(), [user.email], fail_silently=False)


def send_password_reset_email(user, uidb64, token):
    base = _frontend_base_url()
    link = f"{base}/reset-password?uid={uidb64}&token={token}"
    subject = "Reset your Athlon password"
    message = (
        f"Hi {user.display_name or user.email},\n\n"
        "You (or someone using your email) requested a password reset for "
        f"your Athlon account. Use the link below to set a new password:\n\n{link}\n\n"
        "If you didn't request this, you can ignore this email — your password "
        "will remain unchanged."
    )
    send_mail(subject, message, _from_email(), [user.email], fail_silently=False)