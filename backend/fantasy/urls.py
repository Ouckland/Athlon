from django.urls import path

from . import views

app_name = "fantasy"

urlpatterns = [
    path("team/", views.my_team_view, name="team"),
    path("team/squad/", views.my_squad_view, name="squad"),
    path("groups/", views.groups_view, name="group-list"),
    path("groups/join/", views.join_group_view, name="group-join"),
    path("groups/<int:pk>/", views.group_detail_view, name="group-detail"),
    path("groups/<int:pk>/leaderboard/",views.group_leaderboard_view,name="group-leaderboard",),
    path("leaderboard/", views.global_leaderboard_view, name="global-leaderboard"),
]