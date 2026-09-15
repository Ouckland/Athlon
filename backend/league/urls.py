from django.urls import path

from . import views

app_name = "league"

urlpatterns = [
    path("organizations/", views.organizations_view, name="organization-list"),
    path("organizations/<int:pk>/", views.organization_detail_view, name="organization-detail"),
    path("competitions/", views.competitions_view, name="competition-list"),
    path("competitions/<int:pk>/", views.competition_detail_view, name="competition-detail"),
    path("teams/", views.teams_view, name="team-list"),
    path("teams/<int:pk>/", views.team_detail_view, name="team-detail"),
    path("players/", views.players_view, name="player-list"),
    path("players/<int:pk>/", views.player_detail_view, name="player-detail"),
]