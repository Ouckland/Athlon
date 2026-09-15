from django.db import models

# Create your models here.
from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    class Role(models.TextChoices):
        USER = "USER", "User"
        SCOUT = "SCOUT", "Scout"
        ADMIN = "ADMIN", "Admin"

    # Drop username — email is the login identifier.
    username = None

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.USER)

    # Basic profile (kept on User for MVP; no separate Profile model yet).
    display_name = models.CharField(max_length=64, blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    email_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["role"]),
        ]

    def __str__(self):
        return self.display_name or self.get_full_name() or self.email

    @property
    def name(self):
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.display_name or self.email