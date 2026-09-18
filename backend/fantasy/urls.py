from django.urls import path

from . import views

app_name = "fantasy"

urlpatterns = [
    path("teams/", views.teams_view, name="team-list"),
    path("teams/<int:team_id>/", views.team_detail_view, name="team-detail"),
    path(
        "teams/<int:team_id>/squads/<int:stage_id>/",
        views.team_squad_view,
        name="team-squad",
    ),
    path("groups/", views.groups_view, name="group-list"),
    path("groups/join/", views.join_group_view, name="group-join"),
    path("groups/<int:pk>/", views.group_detail_view, name="group-detail"),
    path("groups/<int:pk>/leave/", views.leave_group_view, name="group-leave"),
    path(
        "groups/<int:pk>/members/<int:user_id>/remove/",
        views.remove_member_view,
        name="group-member-remove",
    ),
    path(
        "groups/<int:pk>/leaderboard/",
        views.group_leaderboard_view,
        name="group-leaderboard",
    ),
    path("leaderboard/", views.global_leaderboard_view, name="global-leaderboard"),
]