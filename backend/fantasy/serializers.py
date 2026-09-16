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
    starters = serializers.SerializerMethodField()
    bench = serializers.SerializerMethodField()
    captain_id = serializers.SerializerMethodField()
    total_points = serializers.SerializerMethodField()

    class Meta:
        model = FantasyTeam
        fields = (
            "id",
            "name",
            "created_at",
            "updated_at",
            "starters",
            "bench",
            "captain_id",
            "total_points",
        )

    def _selections(self, obj):
        # Uses the prefetch when available; falls back cleanly otherwise.
        return list(obj.selections.all())

    def get_starters(self, obj):
        return FantasyPlayerSelectionSerializer(
            [s for s in self._selections(obj) if s.is_starter], many=True
        ).data

    def get_bench(self, obj):
        return FantasyPlayerSelectionSerializer(
            [s for s in self._selections(obj) if not s.is_starter], many=True
        ).data

    def get_captain_id(self, obj):
        for s in self._selections(obj):
            if s.is_captain:
                return s.player_id
        return None

    def get_total_points(self, obj):
        # Local import keeps serializers free of a hard import on the
        # leaderboard module at import time.
        from .services import fantasy_team_total_points
        return fantasy_team_total_points(obj)


class FantasyTeamWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)


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
    email = serializers.EmailField(source="user.email", read_only=True)
    joined_at = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = FantasyGroupMembership
        fields = ("user_id", "email", "joined_at")


class FantasyGroupSerializer(serializers.ModelSerializer):
    owner_email = serializers.EmailField(source="owner.email", read_only=True)
    member_count = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()

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
    owner_email = serializers.EmailField()
    total_points = serializers.IntegerField()