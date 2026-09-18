from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from accounts.models import User
from .models import Competition, Organization, Player, Season, Stage, Team
from .serializers import (
    CompetitionSerializer,
    OrganizationSerializer,
    PlayerSerializer,
    SeasonCreateSerializer,
    SeasonSerializer,
    StageCreateSerializer,
    StageSerializer,
    TeamSerializer,
    TeamBriefSerializer,
    CompetitionTeamWriteSerializer,
    TeamManagerSerializer,
    TeamManagerWriteSerializer,
)
from .services import (
    LeagueError,
    add_player_to_team,
    create_competition,
    create_organization,
    create_stage,
    create_team,
    set_team_captain,
    set_team_competitions,
    create_season,
    add_team_to_competition,
    remove_team_from_competition,
    TeamManagerError,
    add_team_manager,
    remove_team_manager,
)
from .permissions import IsAdminOrReadOnly


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


# ---------------------------------------------------------------------------
# Seasons
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def competition_seasons_view(request, competition_id):
    competition = get_object_or_404(Competition, pk=competition_id)

    if request.method == "GET":
        qs = competition.seasons.all()
        return Response(SeasonSerializer(qs, many=True).data)

    serializer = SeasonCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        season = create_season(
            competition=competition,
            name=data["name"],
            status=data.get("status", Season.Status.DRAFT),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
        )
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        SeasonSerializer(season).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def season_detail_view(request, pk):
    season = get_object_or_404(
        Season.objects.select_related("competition"), pk=pk
    )
    return Response(SeasonSerializer(season).data)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def season_stages_view(request, season_id):
    season = get_object_or_404(
        Season.objects.select_related("competition"), pk=season_id
    )

    if request.method == "GET":
        qs = season.stages.all()
        return Response(StageSerializer(qs, many=True).data)

    serializer = StageCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        stage = create_stage(
            season=season,
            kind=data["kind"],
            number=data["number"],
            name=data.get("name", ""),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
        )
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        StageSerializer(stage).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def stage_detail_view(request, pk):
    stage = get_object_or_404(
        Stage.objects.select_related("season", "season__competition"), pk=pk
    )
    return Response(StageSerializer(stage).data)

# ---------------------------------------------------------------------------
# Competition participation
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAdminOrReadOnly])
def competition_teams_view(request, competition_id):
    competition = get_object_or_404(Competition, pk=competition_id)

    if request.method == "GET":
        qs = competition.teams.all().order_by("name")
        return Response(TeamBriefSerializer(qs, many=True).data)

    serializer = CompetitionTeamWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    team = serializer.validated_data["team"]
    try:
        add_team_to_competition(competition=competition, team=team)
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        TeamBriefSerializer(team).data, status=status.HTTP_201_CREATED
    )


@api_view(["DELETE"])
@permission_classes([IsAdminOrReadOnly])
def competition_team_detail_view(request, competition_id, team_id):
    competition = get_object_or_404(Competition, pk=competition_id)
    team = get_object_or_404(Team, pk=team_id)
    try:
        remove_team_from_competition(competition=competition, team=team)
    except LeagueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(status=status.HTTP_204_NO_CONTENT)

# ---------------------------------------------------------------------------
# Team managers
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAdminOrReadOnly])
def team_managers_view(request, team_id):
    team = get_object_or_404(Team, pk=team_id)

    if request.method == "GET":
        qs = team.managers.select_related("user").order_by("-created_at")
        return Response(TeamManagerSerializer(qs, many=True).data)

    serializer = TeamManagerWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]

    try:
        mgr = add_team_manager(team=team, user=user)
    except TeamManagerError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        TeamManagerSerializer(mgr).data, status=status.HTTP_201_CREATED
    )


@api_view(["DELETE"])
@permission_classes([IsAdminOrReadOnly])
def team_manager_detail_view(request, team_id, user_id):
    team = get_object_or_404(Team, pk=team_id)
    user = get_object_or_404(User, pk=user_id)

    try:
        remove_team_manager(team=team, user=user)
    except TeamManagerError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(status=status.HTTP_204_NO_CONTENT)