from rest_framework import serializers

from league.models import Competition, Player, Team

from .models import Match, MatchEvent
from .services import MAX_MINUTE, MIN_MINUTE


# ---------------------------------------------------------------------------
# Brief nested serializers (read-only)
# ---------------------------------------------------------------------------
class TeamBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ("id", "name", "short_name")


class CompetitionBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Competition
        fields = ("id", "name", "slug")


class PlayerBriefSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = ("id", "display_name", "position")

    def get_display_name(self, obj):
        return str(obj)


# ---------------------------------------------------------------------------
# Match — output
# ---------------------------------------------------------------------------
class MatchSerializer(serializers.ModelSerializer):
    competition = CompetitionBriefSerializer(read_only=True)
    home_team = TeamBriefSerializer(read_only=True)
    away_team = TeamBriefSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Match
        fields = (
            "id",
            "competition",
            "home_team",
            "away_team",
            "status",
            "status_display",
            "kickoff_at",
            "started_at",
            "finished_at",
            "home_score",
            "away_score",
            "minute",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Match — input
# ---------------------------------------------------------------------------
class MatchCreateSerializer(serializers.Serializer):
    competition_id = serializers.PrimaryKeyRelatedField(
        queryset=Competition.objects.all(), source="competition"
    )
    home_team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source="home_team"
    )
    away_team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), source="away_team"
    )
    kickoff_at = serializers.DateTimeField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# MatchEvent — output
# ---------------------------------------------------------------------------
class MatchEventSerializer(serializers.ModelSerializer):
    team = TeamBriefSerializer(read_only=True)
    player = PlayerBriefSerializer(read_only=True)
    related_player = PlayerBriefSerializer(read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = MatchEvent
        fields = (
            "id",
            "type",
            "type_display",
            "minute",
            "team",
            "player",
            "related_player",
            "description",
            "created_at",
        )
        read_only_fields = fields


# ---------------------------------------------------------------------------
# MatchEvent — input
# ---------------------------------------------------------------------------
class MatchEventCreateSerializer(serializers.Serializer):
    """
    Shape-only validation. Business rules (which types need a team, substitution
    pairing, lifecycle, score derivation, etc.) live in the service layer and
    are NOT duplicated here.
    """

    type = serializers.ChoiceField(choices=MatchEvent.Type.choices)
    minute = serializers.IntegerField(min_value=MIN_MINUTE, max_value=MAX_MINUTE)
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        source="team",
        required=False,
        allow_null=True,
    )
    player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="player",
        required=False,
        allow_null=True,
    )
    related_player_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="related_player",
        required=False,
        allow_null=True,
    )
    description = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )