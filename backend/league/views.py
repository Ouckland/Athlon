from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Competition, Organization, Player, Team
from .serializers import (
    CompetitionSerializer,
    OrganizationSerializer,
    PlayerSerializer,
    TeamSerializer,
)
from .services import (
    LeagueError,
    add_player_to_team,
    create_competition,
    create_organization,
    create_team,
    set_team_captain,
    set_team_competitions
)


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def organizations_view(request):
    if request.method == "GET":
        qs = Organization.objects.all()
        return Response(OrganizationSerializer(qs, many=True).data)

    serializer = OrganizationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        org = create_organization(
            name=data["name"],
            description=data.get("description", ""),
            logo=data.get("logo"),
        )
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(OrganizationSerializer(org).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def organization_detail_view(request, pk):
    org = get_object_or_404(Organization, pk=pk)
    return Response(OrganizationSerializer(org).data)


# ---------------------------------------------------------------------------
# Competitions
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def competitions_view(request):
    if request.method == "GET":
        qs = Competition.objects.select_related("organization").all()
        org_id = request.query_params.get("organization")
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return Response(CompetitionSerializer(qs, many=True).data)

    serializer = CompetitionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        competition = create_competition(
            organization=data["organization"],
            name=data["name"],
            description=data.get("description", ""),
            season=data.get("season", ""),
            status=data.get("status", Competition.Status.DRAFT),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
        )
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(CompetitionSerializer(competition).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def competition_detail_view(request, pk):
    competition = get_object_or_404(
        Competition.objects.select_related("organization"), pk=pk
    )
    return Response(CompetitionSerializer(competition).data)


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def teams_view(request):
    if request.method == "GET":
        qs = Team.objects.select_related("organization", "captain").prefetch_related(
            "competitions"
        )
        org_id = request.query_params.get("organization")
        comp_id = request.query_params.get("competition")
        if org_id:
            qs = qs.filter(organization_id=org_id)
        if comp_id:
            qs = qs.filter(competitions__id=comp_id)
        return Response(TeamSerializer(qs, many=True).data)

    serializer = TeamSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        with transaction.atomic():
            team = create_team(
                organization=data["organization"],
                name=data["name"],
                short_name=data.get("short_name", ""),
                logo=data.get("logo"),
            )
            if "competitions" in data:
                set_team_competitions(team=team, competitions=data["competitions"])
            if data.get("captain") is not None:
                set_team_captain(team=team, player=data["captain"])
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def team_detail_view(request, pk):
    team = get_object_or_404(
        Team.objects.select_related("organization", "captain").prefetch_related(
            "competitions"
        ),
        pk=pk,
    )
    return Response(TeamSerializer(team).data)


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def players_view(request):
    if request.method == "GET":
        qs = Player.objects.select_related("team").all()
        team_id = request.query_params.get("team")
        if team_id:
            qs = qs.filter(team_id=team_id)
        return Response(PlayerSerializer(qs, many=True).data)

    serializer = PlayerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        player = add_player_to_team(
            team=data["team"],
            user=data.get("user"),
            first_name=data["first_name"],
            last_name=data.get("last_name", ""),
            display_name=data.get("display_name", ""),
            shirt_number=data.get("shirt_number"),
            position=data["position"],
            photo=data.get("photo"),
        )
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(PlayerSerializer(player).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def player_detail_view(request, pk):
    player = get_object_or_404(Player.objects.select_related("team"), pk=pk)
    return Response(PlayerSerializer(player).data)