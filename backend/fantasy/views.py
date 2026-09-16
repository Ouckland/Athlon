from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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
    fantasy_team_total_points,  # noqa: F401  (imported for symmetry; used in serializer)
    global_leaderboard,
    group_leaderboard,
    join_group,
    set_squad,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _my_team_or_none(request):
    return (
        FantasyTeam.objects
        .filter(user=request.user)
        .prefetch_related("selections__player__team")
        .first()
    )


def _serialize_squad(team):
    selections = list(
        team.selections.select_related("player", "player__team").all()
    )
    starters = [s for s in selections if s.is_starter]
    bench = [s for s in selections if not s.is_starter]
    captain = next((s for s in selections if s.is_captain), None)
    return {
        "starters": FantasyPlayerSelectionSerializer(starters, many=True).data,
        "bench": FantasyPlayerSelectionSerializer(bench, many=True).data,
        "captain_id": captain.player_id if captain else None,
    }


def _serialize_leaderboard(rows):
    payload = [
        {
            "rank": i + 1,
            "fantasy_team_id": r["fantasy_team"].id,
            "name": r["fantasy_team"].name,
            "owner_email": r["fantasy_team"].user.email,
            "total_points": r["total_points"],
        }
        for i, r in enumerate(rows)
    ]
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


# ---------------------------------------------------------------------------
# /api/fantasy/team/
# ---------------------------------------------------------------------------
@api_view(["GET", "POST", "PATCH"])
@permission_classes([IsAuthenticated])
def my_team_view(request):
    if request.method == "GET":
        team = _my_team_or_none(request)
        if team is None:
            return Response(
                {"detail": "No fantasy team yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(FantasyTeamSerializer(team).data)

    if request.method == "POST":
        if FantasyTeam.objects.filter(user=request.user).exists():
            return Response(
                {"detail": "You already have a fantasy team."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = FantasyTeamWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            team = create_fantasy_team(
                user=request.user, name=serializer.validated_data["name"]
            )
        except FantasyError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        team = _my_team_or_none(request)
        return Response(
            FantasyTeamSerializer(team).data, status=status.HTTP_201_CREATED
        )

    # PATCH
    team = _my_team_or_none(request)
    if team is None:
        return Response(
            {"detail": "No fantasy team yet."},
            status=status.HTTP_404_NOT_FOUND,
        )
    serializer = FantasyTeamWriteSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    if "name" in serializer.validated_data:
        team.name = serializer.validated_data["name"]
        team.save(update_fields=["name", "updated_at"])
    return Response(FantasyTeamSerializer(team).data)


# ---------------------------------------------------------------------------
# /api/fantasy/team/squad/
# ---------------------------------------------------------------------------
@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def my_squad_view(request):
    team = _my_team_or_none(request)
    if team is None:
        return Response(
            {"detail": "No fantasy team yet."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response(_serialize_squad(team))

    serializer = SquadWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        set_squad(team, serializer.validated_data["selections"])
    except FantasyError as exc:
        return Response(
            {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
        )

    team = _my_team_or_none(request)
    return Response(_serialize_squad(team))


# ---------------------------------------------------------------------------
# /api/fantasy/groups/
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
        return Response(
            {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
        )
    return Response(
        FantasyGroupSerializer(group).data, status=status.HTTP_201_CREATED
    )


# ---------------------------------------------------------------------------
# /api/fantasy/groups/join/
# ---------------------------------------------------------------------------
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
        return Response(
            {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
        )
    return Response(
        FantasyGroupSerializer(membership.group).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# /api/fantasy/groups/<pk>/
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# /api/fantasy/groups/<pk>/leaderboard/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def group_leaderboard_view(request, pk):
    group = get_object_or_404(FantasyGroup, pk=pk)
    denied = _assert_member(request, group)
    if denied:
        return denied
    rows = group_leaderboard(group)
    return Response({"group_id": group.id, "rows": _serialize_leaderboard(rows)})


# ---------------------------------------------------------------------------
# /api/fantasy/leaderboard/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def global_leaderboard_view(request):
    rows = global_leaderboard()
    return Response({"rows": _serialize_leaderboard(rows)})