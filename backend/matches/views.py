from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.response import Response


from league.services.team_managers import can_manage_team
from .permissions import IsScoutOrAdminOrReadOnly
from .models import Match, MatchLineup, Player, Team
from .serializers import (
    MatchCreateSerializer,
    MatchEventCreateSerializer,
    MatchEventSerializer,
    MatchSerializer,
    LineupEntrySerializer,
    LineupSubmitSerializer
)
from .services import MatchError, create_match, record_match_event, submit_lineup


# ---------------------------------------------------------------------------
# /api/matches/
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsScoutOrAdminOrReadOnly])
def matches_list_create_view(request):
    if request.method == "GET":
        qs = (
            Match.objects
            .select_related("competition", "home_team", "away_team")
        )

        competition_id = request.query_params.get("competition")
        if competition_id:
            qs = qs.filter(competition_id=competition_id)

        team_id = request.query_params.get("team")
        if team_id:
            qs = qs.filter(Q(home_team_id=team_id) | Q(away_team_id=team_id))

        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        return Response(MatchSerializer(qs, many=True).data)

    # POST — permission already enforced by IsScoutOrAdminOrReadOnly.
    serializer = MatchCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        match = create_match(
            competition=data["competition"],
            home_team=data["home_team"],
            away_team=data["away_team"],
            kickoff_at=data.get("kickoff_at"),
            stage=data.get("stage"),
        )
    except MatchError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        MatchSerializer(match).data, status=status.HTTP_201_CREATED
    )


# ---------------------------------------------------------------------------
# /api/matches/<pk>/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def match_detail_view(request, pk):
    match = get_object_or_404(
        Match.objects.select_related("competition", "home_team", "away_team"),
        pk=pk,
    )
    return Response(MatchSerializer(match).data)


# ---------------------------------------------------------------------------
# /api/matches/<pk>/events/
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsScoutOrAdminOrReadOnly])
def match_events_view(request, pk):
    match = get_object_or_404(
        Match.objects.select_related("competition", "home_team", "away_team"),
        pk=pk,
    )

    if request.method == "GET":
        events = (
            match.events
            .select_related("team", "player", "related_player")
            .order_by("minute", "created_at")
        )
        return Response(MatchEventSerializer(events, many=True).data)

    # POST — permission already enforced by IsScoutOrAdminOrReadOnly.
    serializer = MatchEventCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        event = record_match_event(
            match=match,
            event_type=data["type"],
            minute=data["minute"],
            team=data.get("team"),
            player=data.get("player"),
            related_player=data.get("related_player"),
            description=data.get("description", ""),
        )
    except MatchError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "event": MatchEventSerializer(event).data,
            "match": MatchSerializer(match).data,
        },
        status=status.HTTP_201_CREATED,
    )

@api_view(["GET", "PUT"])
@permission_classes([IsScoutOrAdminOrReadOnly])
def match_lineup_view(request, pk, team_id):
    match = get_object_or_404(Match, pk=pk)

    if request.method == "GET":
        rows = (
            MatchLineup.objects
            .filter(match=match, team_id=team_id)
            .select_related("player", "team")
            .order_by("-is_starter", "bench_order", "player__last_name")
        )
        return Response(LineupEntrySerializer(rows, many=True).data)

    serializer = LineupSubmitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    from league.models import Player, Team
    team = get_object_or_404(Team, pk=data["team_id"])
    if team.id != int(team_id):
        return Response(
            {"detail": "team_id in body must match URL."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    starters = list(Player.objects.filter(id__in=data["starters"]))
    bench = list(Player.objects.filter(id__in=data.get("bench", [])))

    if len(starters) != len(data["starters"]) or len(bench) != len(data.get("bench", [])):
        return Response(
            {"detail": "One or more player IDs do not exist."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        submit_lineup(match=match, team=team, starters=starters, bench=bench)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    rows = (
        MatchLineup.objects
        .filter(match=match, team=team)
        .select_related("player", "team")
        .order_by("-is_starter", "bench_order", "player__last_name")
    )
    return Response(LineupEntrySerializer(rows, many=True).data)

@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticatedOrReadOnly])
def match_lineup_view(request, pk, team_id):
    match = get_object_or_404(Match, pk=pk)
    team = get_object_or_404(Team, pk=team_id)

    if request.method == "GET":
        rows = (
            MatchLineup.objects
            .filter(match=match, team=team)
            .select_related("player", "team")
            .order_by("-is_starter", "bench_order", "player__last_name")
        )
        return Response(LineupEntrySerializer(rows, many=True).data)

    # PUT — authorize and validate the match/team context BEFORE touching
    # the database or the request body. If any check below fails, we return
    # early and no existing lineup is modified.
    #
    # The single source of truth for authorization is
    # league.services.team_managers.can_manage_team(user, team). We do not
    # duplicate its rules here; we only load `team` first, which is why the
    # check lives in the view rather than a DRF permission class.

    # 1. Team must be one of the two teams in the match.
    if team.id not in (match.home_team_id, match.away_team_id):
        return Response(
            {"detail": "Team is not part of this match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 2. Team must be a participating team in the match's competition.
    # create_match() already guarantees this today, but we re-check here so
    # that a change on either side cannot create an inconsistent lineup.
    if not match.competition.teams.filter(id=team.id).exists():
        return Response(
            {"detail": "Team is not participating in this competition."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 3. User must be authorized to manage the team.
    if not can_manage_team(request.user, team):
        return Response(
            {"detail": "You are not authorized to manage this team's lineup."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Only now do we inspect the body and mutate state.
    serializer = LineupSubmitSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if int(data["team_id"]) != team.id:
        return Response(
            {"detail": "team_id in body must match URL."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    starters = list(Player.objects.filter(id__in=data["starters"]))
    bench_ids = data.get("bench", [])
    bench = list(Player.objects.filter(id__in=bench_ids))

    if len(starters) != len(data["starters"]) or len(bench) != len(bench_ids):
        return Response(
            {"detail": "One or more player IDs do not exist."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        submit_lineup(match=match, team=team, starters=starters, bench=bench)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    rows = (
        MatchLineup.objects
        .filter(match=match, team=team)
        .select_related("player", "team")
        .order_by("-is_starter", "bench_order", "player__last_name")
    )
    return Response(LineupEntrySerializer(rows, many=True).data)