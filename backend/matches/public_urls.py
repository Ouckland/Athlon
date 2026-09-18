from django.urls import path

from . import public_views

app_name = "matches-public"

urlpatterns = [
    path("matches/", public_views.public_matches_view, name="public-matches"),
]