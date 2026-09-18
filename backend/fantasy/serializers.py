from django.contrib.auth import get_user_model
from rest_framework import serializers

from league.models import Player

from .models import (
    FantasyGroup,
    FantasyGroupMembership,
    FantasyPlayerSelection,
    FantasyTeam,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared briefs
# ---------------------------------------------------------------------------
class PlayerBriefSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    team = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = (
            "id",
            "first_name",
            "last_name",
            "display_name",
            "position",
            "shirt_number",
            "team",
        )

    def get_display_name(self, obj):
        return str(obj)

    def get_team(self, obj):
        if obj.team_id is None:
            return None
        return {"id": obj.team_id, "name": obj.team.name}


# ---------------------------------------------------------------------------
# Fantasy team
# ---------------------------------------------------------------------------
class FantasyPlayerSelectionSerializer(serializers.ModelSerializer):
    player = PlayerBriefSerializer(read_only=True)

    class Meta:
        model = FantasyPlayerSelection
        fields = ("id", "player", "is_starter", "is_captain")

class FantasyTeamSerializer(serializers.ModelSerializer):
    from matches.serializers import CompetitionBriefSerializer, SeasonBriefSerializer
    competition = CompetitionBriefSerializer(read_only=True)
    season = SeasonBriefSerializer(read_only=True)
    total_points = serializers.SerializerMethodField()

    class Meta:
        model = FantasyTeam
        fields = (
            "id",
            "name",
            "competition",
            "season",
            "total_points",
            "created_at",
            "updated_at",
        )

    def get_total_points(self, obj):
        from .services import fantasy_team_total_points
        return fantasy_team_total_points(obj)

class FantasyTeamWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    competition_id = serializers.IntegerField()
    season_id = serializers.IntegerField()

# ---------------------------------------------------------------------------
# Squad input
# ---------------------------------------------------------------------------
class SquadSelectionWriteSerializer(serializers.Serializer):
    player_id = serializers.IntegerField()
    is_starter = serializers.BooleanField()
    is_captain = serializers.BooleanField(required=False, default=False)


class SquadWriteSerializer(serializers.Serializer):
    selections = SquadSelectionWriteSerializer(many=True)


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
class FantasyGroupMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    display_name = serializers.SerializerMethodField()
    joined_at = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = FantasyGroupMembership
        fields = ("user_id", "display_name", "joined_at")

    def get_display_name(self, obj):
        return obj.user.display_name or obj.user.get_full_name() or f"User #{obj.user_id}"


class FantasyGroupSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)
    member_count = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    owner_id = serializers.IntegerField(source="owner.id", read_only=True)
    owner_display_name = serializers.SerializerMethodField()
    class Meta:
        model = FantasyGroup
        fields = (
            "id",
            "name",
            "invite_code",
            "owner_email",
            "member_count",
            "members",
            "created_at",
            "updated_at",
        )


    def get_owner_display_name(self, obj):
        return obj.owner.display_name or obj.owner.get_full_name() or f"User #{obj.owner_id}"

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_members(self, obj):
        qs = obj.memberships.select_related("user").all()
        return FantasyGroupMemberSerializer(qs, many=True).data


class FantasyGroupCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class FantasyGroupJoinSerializer(serializers.Serializer):
    invite_code = serializers.CharField(max_length=12)


# ---------------------------------------------------------------------------
# Leaderboards
# ---------------------------------------------------------------------------
class LeaderboardRowSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    fantasy_team_id = serializers.IntegerField()
    name = serializers.CharField()
    owner_id = serializers.IntegerField()
    owner_display_name = serializers.CharField()
    total_points = serializers.IntegerField()