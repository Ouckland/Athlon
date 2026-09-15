from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Match
from .serializers import (
    MatchCreateSerializer,
    MatchEventCreateSerializer,
    MatchEventSerializer,
    MatchSerializer,
)
from .services import MatchError, create_match, record_match_event


# ---------------------------------------------------------------------------
# /api/matches/
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
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

    # POST
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    serializer = MatchCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        match = create_match(
            competition=data["competition"],
            home_team=data["home_team"],
            away_team=data["away_team"],
            kickoff_at=data.get("kickoff_at"),
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
@permission_classes([AllowAny])
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

    # POST
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

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