from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = ("email", "display_name", "role", "is_active", "email_verified", "is_staff", "created_at")
    list_filter = ("role", "is_active", "email_verified", "is_staff", "is_superuser")
    readonly_fields = ("created_at", "updated_at", "last_login", "date_joined", "email_verified_at")
    search_fields = ("email", "first_name", "last_name", "display_name")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Personal info",
            {"fields": ("first_name", "last_name", "display_name", "avatar")},
        ),
        (
            "Role & status",
            {"fields": ("role", "is_active", "is_staff", "is_superuser")},
        ),
        (
            "Important dates",
            {"fields": ("last_login", "date_joined", "created_at", "updated_at")},
        ),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "role",
                    "is_active",
                ),
            },
        ),
    )