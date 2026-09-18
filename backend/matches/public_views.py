from datetime import timedelta

from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from league.models import Competition, Organization

from .models import Match
from .serializers import PublicMatchSerializer


VALID_DATES = {"today", "tomorrow", "week"}
VALID_STATUSES = set(Match.Status.values)

# HALFTIME is a break in an ongoing match, not a terminal state.
LIVE_STATUSES = (Match.Status.LIVE, Match.Status.HALFTIME)

# Excluded from calendar-date filters (today / tomorrow / week).
EXCLUDED_STATUSES = (Match.Status.POSTPONED, Match.Status.CANCELLED)


def _local_day_bounds(days_offset=0):
    """
    Return (start, end) as timezone-aware datetimes for a local calendar day.
    `end` is exclusive.
    """
    now_local = timezone.localtime(timezone.now())
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = today_start + timedelta(days=days_offset)
    end = start + timedelta(days=1)
    return start, end


def _parse_int(value, name):
    """
    Return int(value) or None. Caller returns 400 when None.
    Avoids the 500 that get_object_or_404(pk='abc') would raise.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@api_view(["GET"])
@permission_classes([AllowAny])
def public_matches_view(request):
    """
    Public, unauthenticated fixtures + livescore feed.

    Query params — all optional, all composable:
      - date=today | tomorrow | week
      - status=LIVE (or any literal Match.Status value)
      - competition=<int>
      - organization=<int>
    """
    qs = Match.objects.select_related(
        "competition", "stage", "home_team", "away_team"
    )

    # 1. Status filter — independent.
    status_param = request.query_params.get("status")
    if status_param:
        status_value = status_param.strip().upper()
        if status_value == "LIVE":
            qs = qs.filter(status__in=LIVE_STATUSES)
        elif status_value in VALID_STATUSES:
            qs = qs.filter(status=status_value)
        else:
            return Response(
                {"detail": f"Unknown status filter: {status_param!r}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # 2. Date filter — independent.
    date_param = request.query_params.get("date")
    if date_param:
        if date_param not in VALID_DATES:
            return Response(
                {"detail": f"Unknown date filter: {date_param!r}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if date_param == "today":
            start, end = _local_day_bounds(0)
        elif date_param == "tomorrow":
            start, end = _local_day_bounds(1)
        else:  # week: today through today + 6 (7 calendar days inclusive)
            start, _ = _local_day_bounds(0)
            _, end = _local_day_bounds(6)

        qs = (
            qs.filter(kickoff_at__gte=start, kickoff_at__lt=end)
            .exclude(status__in=EXCLUDED_STATUSES)
        )

    # 3. Competition filter — independent.
    competition_param = request.query_params.get("competition")
    if competition_param:
        competition_id = _parse_int(competition_param, "competition")
        if competition_id is None:
            return Response(
                {"detail": "competition must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        competition = get_object_or_404(Competition, pk=competition_id)
        qs = qs.filter(competition=competition)

    # 4. Organization filter — independent.
    #    Match has no direct organization FK. The authoritative relationship
    #    is Match.competition.organization; create_match() already enforces
    #    that both teams belong to the competition's organization, so this
    #    is sufficient and correct.
    organization_param = request.query_params.get("organization")
    if organization_param:
        organization_id = _parse_int(organization_param, "organization")
        if organization_id is None:
            return Response(
                {"detail": "organization must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        organization = get_object_or_404(Organization, pk=organization_id)
        qs = qs.filter(competition__organization=organization)

    qs = qs.order_by(F("kickoff_at").asc(nulls_last=True), "id")

    serializer = PublicMatchSerializer(qs, many=True)
    return Response({"count": len(serializer.data), "results": serializer.data})