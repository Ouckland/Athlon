from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from league.models import Competition, Season, Stage

from .models import FantasyGroup, FantasyGroupMembership, FantasyTeam
from .serializers import (
    FantasyGroupCreateSerializer,
    FantasyGroupJoinSerializer,
    FantasyGroupSerializer,
    FantasyPlayerSelectionSerializer,
    FantasyTeamSerializer,
    FantasyTeamWriteSerializer,
    LeaderboardRowSerializer,
    SquadWriteSerializer,
)
from .services import (
    FantasyError,
    create_fantasy_team,
    create_group,
    group_season_leaderboard,
    group_stage_leaderboard,
    join_group,
    leave_group,
    remove_group_member,
    season_leaderboard,
    set_squad,
    stage_leaderboard,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _serialize_squad(team, stage):
    selections = list(
        team.selections.filter(stage=stage)
        .select_related("player", "player__team", "player__fantasy_price")
    )
    starters = [s for s in selections if s.is_starter]
    bench = [s for s in selections if not s.is_starter]
    captain = next((s for s in selections if s.is_captain), None)

    from .services import squad_total_cost
    try:
        total_cost = squad_total_cost(selections)
    except Exception:
        total_cost = None

    return {
        "starters": FantasyPlayerSelectionSerializer(starters, many=True).data,
        "bench": FantasyPlayerSelectionSerializer(bench, many=True).data,
        "captain_id": captain.player_id if captain else None,
        "squad_value": str(total_cost) if total_cost is not None else None,
        "remaining_budget": (
            str(team.starting_budget - total_cost)
            if total_cost is not None
            else None
        ),
    }


def _serialize_leaderboard(rows):
    payload = []
    for i, r in enumerate(rows):
        team = r["fantasy_team"]
        user = team.user
        payload.append(
            {
                "rank": i + 1,
                "fantasy_team_id": team.id,
                "name": team.name,
                "owner_id": user.id,
                "owner_display_name": (
                    user.display_name
                    or user.get_full_name()
                    or f"User #{user.id}"
                ),
                "total_points": r["total_points"],
            }
        )
    return LeaderboardRowSerializer(payload, many=True).data


def _assert_member(request, group):
    if not FantasyGroupMembership.objects.filter(
        group=group, user=request.user
    ).exists():
        return Response(
            {"detail": "You are not a member of this group."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _my_team_or_404(request, team_id):
    return get_object_or_404(
        FantasyTeam.objects
        .filter(user=request.user)
        .select_related("competition", "season"),
        pk=team_id,
    )


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def teams_view(request):
    if request.method == "GET":
        qs = (
            FantasyTeam.objects
            .filter(user=request.user)
            .select_related("competition", "season")
        )
        return Response(FantasyTeamSerializer(qs, many=True).data)

    serializer = FantasyTeamWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    competition = get_object_or_404(Competition, pk=data["competition_id"])
    season = get_object_or_404(Season, pk=data["season_id"])

    try:
        team = create_fantasy_team(
            user=request.user,
            name=data["name"],
            competition=competition,
            season=season,
        )
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(FantasyTeamSerializer(team).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def team_detail_view(request, team_id):
    team = _my_team_or_404(request, team_id)

    if request.method == "GET":
        return Response(FantasyTeamSerializer(team).data)

    # PATCH — only name is editable
    serializer = FantasyTeamWriteSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "name" in serializer.validated_data:
        team.name = serializer.validated_data["name"]
        team.save(update_fields=["name", "updated_at"])
    return Response(FantasyTeamSerializer(team).data)


# ---------------------------------------------------------------------------
# Squad (per stage)
# ---------------------------------------------------------------------------
@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def team_squad_view(request, team_id, stage_id):
    team = _my_team_or_404(request, team_id)
    stage = get_object_or_404(Stage.objects.select_related("season"), pk=stage_id)

    if stage.season_id != team.season_id:
        return Response(
            {"detail": "Stage is not in this fantasy team's season."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "GET":
        return Response(_serialize_squad(team, stage))

    serializer = SquadWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        set_squad(
            fantasy_team=team,
            stage=stage,
            selections=serializer.validated_data["selections"],
        )
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(_serialize_squad(team, stage))


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def groups_view(request):
    if request.method == "GET":
        memberships = (
            FantasyGroupMembership.objects
            .filter(user=request.user)
            .select_related("group", "group__owner")
            .order_by("-created_at")
        )
        groups = [m.group for m in memberships]
        return Response(FantasyGroupSerializer(groups, many=True).data)

    serializer = FantasyGroupCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        group = create_group(
            owner=request.user, name=serializer.validated_data["name"]
        )
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(FantasyGroupSerializer(group).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join_group_view(request):
    serializer = FantasyGroupJoinSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        membership = join_group(
            user=request.user,
            invite_code=serializer.validated_data["invite_code"],
        )
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        FantasyGroupSerializer(membership.group).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def group_detail_view(request, pk):
    group = get_object_or_404(
        FantasyGroup.objects.select_related("owner"), pk=pk
    )
    denied = _assert_member(request, group)
    if denied:
        return denied
    return Response(FantasyGroupSerializer(group).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def leave_group_view(request, pk):
    group = get_object_or_404(FantasyGroup, pk=pk)
    try:
        leave_group(user=request.user, group=group)
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_member_view(request, pk, user_id):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    group = get_object_or_404(FantasyGroup, pk=pk)
    member = get_object_or_404(User, pk=user_id)
    try:
        remove_group_member(owner=request.user, group=group, member_user=member)
    except FantasyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Leaderboards
# ---------------------------------------------------------------------------
def _resolve_leaderboard_scope(request):
    competition_id = request.query_params.get("competition")
    season_id = request.query_params.get("season")
    stage_id = request.query_params.get("stage")
    if not competition_id or not season_id:
        return None, Response(
            {"detail": "competition and season query params are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    competition = get_object_or_404(Competition, pk=competition_id)
    season = get_object_or_404(Season, pk=season_id)
    stage = get_object_or_404(Stage, pk=stage_id) if stage_id else None
    return (competition, season, stage), None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def global_leaderboard_view(request):
    scope, err = _resolve_leaderboard_scope(request)
    if err:
        return err
    competition, season, stage = scope
    rows = (
        stage_leaderboard(competition=competition, season=season, stage=stage)
        if stage is not None
        else season_leaderboard(competition=competition, season=season)
    )
    return Response({"rows": _serialize_leaderboard(rows)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def group_leaderboard_view(request, pk):
    group = get_object_or_404(FantasyGroup, pk=pk)
    denied = _assert_member(request, group)
    if denied:
        return denied
    scope, err = _resolve_leaderboard_scope(request)
    if err:
        return err
    competition, season, stage = scope
    rows = (
        group_stage_leaderboard(
            group=group, competition=competition, season=season, stage=stage
        )
        if stage is not None
        else group_season_leaderboard(
            group=group, competition=competition, season=season
        )
    )
    return Response({"group_id": group.id, "rows": _serialize_leaderboard(rows)})