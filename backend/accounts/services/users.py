from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import IntegrityError
from django.utils import timezone

User = get_user_model()


class RegistrationError(Exception):
    """Raised when a user cannot be registered for domain reasons."""


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
def register_user(*, email, password, first_name="", last_name="", display_name=""):
    """
    Create a new User via the custom manager.

    - normalizes email
    - never stores a raw password (delegated to the manager)
    - returns the created user (unverified by default)
    """
    if not email:
        raise RegistrationError("Email is required.")
    if not password:
        raise RegistrationError("Password is required.")

    normalized_email = User.objects.normalize_email(email).lower()

    if User.objects.filter(email__iexact=normalized_email).exists():
        raise RegistrationError("A user with this email already exists.")

    try:
        user = User.objects.create_user(
            email=normalized_email,
            password=password,
            first_name=first_name or "",
            last_name=last_name or "",
            display_name=display_name or "",
        )
    except IntegrityError as exc:
        raise RegistrationError("A user with this email already exists.") from exc

    return user


# ---------------------------------------------------------------------------
# Email verification tokens (stateless — signed with Django's signer)
# ---------------------------------------------------------------------------
_EMAIL_VERIFICATION_SALT = "accounts.email_verification"
_verification_signer = TimestampSigner(salt=_EMAIL_VERIFICATION_SALT)


def generate_email_verification_token(user):
    """Return a signed token that encodes user id + current email."""
    return _verification_signer.sign(f"{user.pk}:{user.email}")


def verify_email_token(token):
    """
    Return (user, None) on success or (None, reason) on failure.
    reason is one of 'expired' | 'invalid'.
    """
    max_age = getattr(settings, "EMAIL_VERIFICATION_TIMEOUT", 60 * 60 * 24 * 3)
    try:
        value = _verification_signer.unsign(token, max_age=max_age)
    except SignatureExpired:
        return None, "expired"
    except BadSignature:
        return None, "invalid"

    try:
        pk_str, email = value.split(":", 1)
        pk = int(pk_str)
    except (ValueError, TypeError):
        return None, "invalid"

    user = User.objects.filter(pk=pk).first()
    if user is None or user.email != email:
        return None, "invalid"
    return user, None


def mark_email_verified(user):
    if user.email_verified:
        return user
    user.email_verified = True
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified", "email_verified_at", "updated_at"])
    return user


# ---------------------------------------------------------------------------
# Password reset tokens (Django's built-in generator)
# ---------------------------------------------------------------------------
def generate_password_reset_token(user):
    return default_token_generator.make_token(user)


def verify_password_reset_token(user, token):
    return default_token_generator.check_token(user, token)