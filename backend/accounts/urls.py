from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("register/", views.register_view, name="register"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me_view, name="me"),
    path("verify-email/<str:token>/", views.verify_email_view, name="verify-email"),
    path("resend-verification/", views.resend_verification_view, name="resend-verification"),
    path("forgot-password/", views.forgot_password_view, name="forgot-password"),
    path("reset-password/", views.reset_password_view, name="reset-password"),
]