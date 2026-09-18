from django.urls import path

from . import views

app_name = "matches"

urlpatterns = [
    path("", views.matches_list_create_view, name="match-list"),
    path("<int:pk>/", views.match_detail_view, name="match-detail"),
    path("<int:pk>/events/", views.match_events_view, name="match-events"),
    path(
        "<int:pk>/lineups/<int:team_id>/",
        views.match_lineup_view,
        name="match-lineup",
    ),
]