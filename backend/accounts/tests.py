from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .services.users import generate_email_verification_token, generate_password_reset_token

User = get_user_model()


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
class UserModelTests(TestCase):
    def test_create_user_hashes_password(self):
        user = User.objects.create_user(email="a@example.com", password="StrongPass!23")
        self.assertNotEqual(user.password, "StrongPass!23")
        self.assertTrue(user.check_password("StrongPass!23"))

    def test_email_is_normalized(self):
        user = User.objects.create_user(email="Mixed@EXAMPLE.com", password="StrongPass!23")
        self.assertEqual(user.email, "mixed@example.com")

    def test_email_is_unique(self):
        User.objects.create_user(email="dup@example.com", password="StrongPass!23")
        with self.assertRaises(IntegrityError):
            User.objects.create_user(email="dup@example.com", password="StrongPass!23")

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="StrongPass!23")

    def test_default_role_is_user(self):
        user = User.objects.create_user(email="role@example.com", password="StrongPass!23")
        self.assertEqual(user.role, User.Role.USER)

    def test_create_superuser(self):
        admin = User.objects.create_superuser(
            email="admin@example.com", password="StrongPass!23"
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_active)
        self.assertEqual(admin.role, User.Role.ADMIN)

    def test_str_prefers_display_name(self):
        user = User.objects.create_user(
            email="n@example.com", password="StrongPass!23", display_name="Nick"
        )
        self.assertEqual(str(user), "Nick")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
class RegistrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("accounts:register")
        self.payload = {
            "email": "New@Example.com",
            "password": "StrongPass!23",
            "password_confirmation": "StrongPass!23",
            "first_name": "Jane",
            "last_name": "Doe",
            "display_name": "jane",
        }

    def test_register_success(self):
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["email"], "new@example.com")
        self.assertNotIn("password", resp.data)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())

    def test_register_duplicate_email(self):
        User.objects.create_user(email="dup@example.com", password="StrongPass!23")
        payload = {**self.payload, "email": "dup@example.com",
                   "password_confirmation": "StrongPass!23"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_register_password_mismatch(self):
        payload = {**self.payload, "password_confirmation": "Different!23"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password_confirmation", resp.data)

    def test_register_invalid_password(self):
        payload = {**self.payload, "password": "short", "password_confirmation": "short"}
        resp = self.client.post(self.url, payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)

    def test_register_never_returns_password(self):
        resp = self.client.post(self.url, self.payload, format="json")
        body = resp.content.decode()
        self.assertNotIn("StrongPass!23", body)
        self.assertNotIn("password", resp.data)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="log@example.com", password="StrongPass!23"
        )
        self.url = reverse("accounts:login")

    def test_login_success(self):
        resp = self.client.post(
            self.url,
            {"email": "log@example.com", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], "log@example.com")
        # Session cookie should now exist.
        self.assertIn("sessionid", resp.cookies)

    def test_login_email_is_case_insensitive(self):
        resp = self.client.post(
            self.url,
            {"email": "LOG@example.com", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

    def test_login_invalid_credentials(self):
        resp = self.client.post(
            self.url,
            {"email": "log@example.com", "password": "nope"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.data["detail"], "Invalid credentials.")

    def test_login_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save()
        resp = self.client.post(
            self.url,
            {"email": "log@example.com", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)


# ---------------------------------------------------------------------------
# Me / Logout
# ---------------------------------------------------------------------------
class MeAndLogoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="me@example.com", password="StrongPass!23"
        )
        self.me_url = reverse("accounts:me")
        self.logout_url = reverse("accounts:logout")

    def test_me_unauthenticated(self):
        resp = self.client.get(self.me_url)
        self.assertIn(resp.status_code, (401, 403))

    def test_me_authenticated(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get(self.me_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], "me@example.com")

    def test_logout_requires_auth(self):
        resp = self.client.post(self.logout_url)
        self.assertIn(resp.status_code, (401, 403))

    def test_logout_success(self):
        self.client.force_login(self.user)
        resp = self.client.post(self.logout_url)
        self.assertEqual(resp.status_code, 204)
        # Session should be gone.
        resp2 = self.client.get(self.me_url)
        self.assertIn(resp2.status_code, (401, 403))


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------
class EmailVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="v@example.com", password="StrongPass!23"
        )

    def test_new_user_starts_unverified(self):
        self.assertFalse(self.user.email_verified)
        self.assertIsNone(self.user.email_verified_at)

    def test_valid_token_verifies_user(self):
        token = generate_email_verification_token(self.user)
        resp = self.client.get(reverse("accounts:verify-email", args=[token]))
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertIsNotNone(self.user.email_verified_at)

    def test_invalid_token_rejected(self):
        resp = self.client.get(reverse("accounts:verify-email", args=["totally-bogus"]))
        self.assertEqual(resp.status_code, 400)

    def test_tampered_token_rejected(self):
        token = generate_email_verification_token(self.user)
        tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
        resp = self.client.get(reverse("accounts:verify-email", args=[tampered]))
        self.assertEqual(resp.status_code, 400)

    def test_expired_token_rejected(self):
        with override_settings(EMAIL_VERIFICATION_TIMEOUT=-1):
            token = generate_email_verification_token(self.user)
            resp = self.client.get(reverse("accounts:verify-email", args=[token]))
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["reason"], "expired")

    def test_already_verified_is_idempotent(self):
        token = generate_email_verification_token(self.user)
        self.client.get(reverse("accounts:verify-email", args=[token]))
        resp = self.client.get(reverse("accounts:verify-email", args=[token]))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("already", resp.data["detail"].lower())

    def test_token_invalid_after_email_change(self):
        token = generate_email_verification_token(self.user)
        self.user.email = "changed@example.com"
        self.user.save()
        resp = self.client.get(reverse("accounts:verify-email", args=[token]))
        self.assertEqual(resp.status_code, 400)


# ---------------------------------------------------------------------------
# Resend verification
# ---------------------------------------------------------------------------
class ResendVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("accounts:resend-verification")

    def test_unverified_user_receives_email(self):
        User.objects.create_user(email="r@example.com", password="StrongPass!23")
        mail.outbox.clear()
        resp = self.client.post(self.url, {"email": "r@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("r@example.com", mail.outbox[0].to)

    def test_verified_user_receives_no_email(self):
        user = User.objects.create_user(email="v@example.com", password="StrongPass!23")
        user.email_verified = True
        user.save()
        mail.outbox.clear()
        resp = self.client.post(self.url, {"email": "v@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_nonexistent_email_returns_same_response(self):
        mail.outbox.clear()
        resp1 = self.client.post(self.url, {"email": "ghost@example.com"}, format="json")
        User.objects.create_user(email="real@example.com", password="StrongPass!23")
        resp2 = self.client.post(self.url, {"email": "real@example.com"}, format="json")
        self.assertEqual(resp1.status_code, resp2.status_code)
        self.assertEqual(resp1.data, resp2.data)


# ---------------------------------------------------------------------------
# Forgot password
# ---------------------------------------------------------------------------
class ForgotPasswordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("accounts:forgot-password")

    def test_existing_email_triggers_email(self):
        User.objects.create_user(email="f@example.com", password="StrongPass!23")
        mail.outbox.clear()
        resp = self.client.post(self.url, {"email": "f@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("reset", mail.outbox[0].subject.lower())

    def test_nonexistent_email_same_response(self):
        mail.outbox.clear()
        resp1 = self.client.post(self.url, {"email": "ghost@example.com"}, format="json")
        User.objects.create_user(email="real@example.com", password="StrongPass!23")
        resp2 = self.client.post(self.url, {"email": "real@example.com"}, format="json")
        self.assertEqual(resp1.status_code, resp2.status_code)
        self.assertEqual(resp1.data, resp2.data)

    def test_inactive_user_no_email(self):
        user = User.objects.create_user(email="x@example.com", password="StrongPass!23")
        user.is_active = False
        user.save()
        mail.outbox.clear()
        resp = self.client.post(self.url, {"email": "x@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------
class ResetPasswordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("accounts:reset-password")
        self.user = User.objects.create_user(
            email="p@example.com", password="OldPass!23x"
        )
        self.uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = generate_password_reset_token(self.user)

    def _payload(self, **overrides):
        return {
            "uid": self.uidb64,
            "token": self.token,
            "new_password": "NewPass!23x",
            "new_password_confirmation": "NewPass!23x",
            **overrides,
        }

    def test_valid_token_changes_password(self):
        resp = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass!23x"))
        self.assertFalse(self.user.check_password("OldPass!23x"))

    def test_invalid_token_rejected(self):
        resp = self.client.post(
            self.url, self._payload(token="not-a-real-token"), format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_mismatched_passwords_rejected(self):
        resp = self.client.post(
            self.url,
            self._payload(new_password_confirmation="different"),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password_confirmation", resp.data)

    def test_invalid_password_rejected(self):
        resp = self.client.post(
            self.url,
            self._payload(new_password="short", new_password_confirmation="short"),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password", resp.data)

    def test_old_password_no_longer_works(self):
        self.client.post(self.url, self._payload(), format="json")
        resp = self.client.post(
            reverse("accounts:login"),
            {"email": "p@example.com", "password": "OldPass!23x"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_new_password_works(self):
        self.client.post(self.url, self._payload(), format="json")
        resp = self.client.post(
            reverse("accounts:login"),
            {"email": "p@example.com", "password": "NewPass!23x"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

    def test_token_cannot_be_reused(self):
        self.client.post(self.url, self._payload(), format="json")
        resp = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(resp.status_code, 400)