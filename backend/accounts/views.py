import logging

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import (
    EmailOnlySerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    UserSerializer,
)
from .services.email import send_password_reset_email, send_verification_email
from .services.users import (
    RegistrationError,
    generate_email_verification_token,
    generate_password_reset_token,
    mark_email_verified,
    register_user,
    verify_email_token,
    verify_password_reset_token,
)

logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        user = register_user(
            email=data["email"],
            password=data["password"],
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            display_name=data.get("display_name", ""),
        )
    except RegistrationError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # Fire-and-forget verification email. Do not fail registration if SMTP hiccups.
    try:
        token = generate_email_verification_token(user)
        send_verification_email(user, token)
    except Exception:
        logger.exception("Failed to send verification email for user %s", user.pk)

    login(request, user)
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Login / logout
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {"detail": "Email and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=email, password=password)
    if user is None or not user.is_active:
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    login(request, user)
    return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def verify_email_view(request, token):
    user, reason = verify_email_token(token)
    if user is None:
        return Response(
            {"detail": "Invalid or expired verification token.", "reason": reason},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.email_verified:
        return Response(
            {"detail": "Email is already verified.", "email_verified": True},
            status=status.HTTP_200_OK,
        )

    mark_email_verified(user)
    return Response(
        {"detail": "Email verified successfully.", "email_verified": True},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_verification_view(request):
    serializer = EmailOnlySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().lower()

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is not None and not user.email_verified:
        try:
            token = generate_email_verification_token(user)
            send_verification_email(user, token)
        except Exception:
            logger.exception("Failed to resend verification email for user %s", user.pk)

    # Always return the same response — no account-enumeration signal.
    return Response(
        {
            "detail": (
                "If an account exists for this email and is unverified, "
                "a verification email has been sent."
            )
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_view(request):
    serializer = EmailOnlySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().lower()

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is not None:
        try:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = generate_password_reset_token(user)
            send_password_reset_email(user, uidb64, token)
        except Exception:
            logger.exception("Failed to send password reset email for user %s", user.pk)

    # Same outward response regardless of account existence.
    return Response(
        {
            "detail": (
                "If an account exists for this email, a password reset link has been sent."
            )
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password_view(request):
    serializer = ResetPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        uid = urlsafe_base64_decode(data["uid"]).decode()
        user = User.objects.get(pk=uid, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response(
            {"detail": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_password_reset_token(user, data["token"]):
        return Response(
            {"detail": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(data["new_password"])
    user.save(update_fields=["password", "updated_at"])

    return Response(
        {"detail": "Password has been reset successfully."},
        status=status.HTTP_200_OK,
    )