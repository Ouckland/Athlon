from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
class UserSerializer(serializers.ModelSerializer):
    """Safe, public representation of a user."""

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "avatar",
            "role",
            "email_verified",
            "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirmation = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=64)

    def validate_email(self, value):
        normalized = User.objects.normalize_email(value).lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized

    def validate(self, attrs):
        password = attrs.get("password")
        confirmation = attrs.get("password_confirmation")

        if password != confirmation:
            raise serializers.ValidationError(
                {"password_confirmation": "Passwords do not match."}
            )

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        return attrs


class EmailOnlySerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password_confirmation = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirmation"]:
            raise serializers.ValidationError(
                {"new_password_confirmation": "Passwords do not match."}
            )
        try:
            validate_password(attrs["new_password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)})
        return attrs