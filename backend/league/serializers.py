from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Competition, Organization, Player, Season, Stage, Team
User = get_user_model()


# ---------------------------------------------------------------------------
# Nested brief representations
# ---------------------------------------------------------------------------
class OrganizationBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug")


class CompetitionBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Competition
        fields = ("id", "name", "slug", "season", "status")


class TeamBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ("id", "name", "short_name", "slug")


class CaptainBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ("id", "display_name")

    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj):
        return str(obj)


# ---------------------------------------------------------------------------
# Full representations
# ---------------------------------------------------------------------------
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "logo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

class CompetitionSerializer(serializers.ModelSerializer):
    organization = OrganizationBriefSerializer(read_only=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        source="organization",
        write_only=True,
    )

    class Meta:
        model = Competition
        fields = (
            "id",
            "organization",
            "organization_id",
            "name",
            "slug",
            "description",
            "type",           # new
            "season",
            "status",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

class SeasonBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Season
        fields = ("id", "name", "slug", "status")


class StageBriefSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Stage
        fields = ("id", "kind", "kind_display", "number", "name")


class SeasonSerializer(serializers.ModelSerializer):
    competition = CompetitionBriefSerializer(read_only=True)

    class Meta:
        model = Season
        fields = (
            "id",
            "competition",
            "name",
            "slug",
            "status",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class SeasonCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    status = serializers.ChoiceField(
        choices=Season.Status.choices, required=False, default=Season.Status.DRAFT
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and start > end:
            raise serializers.ValidationError(
                {"end_date": "Season end date must be on or after start date."}
            )
        return attrs


class StageSerializer(serializers.ModelSerializer):
    season = SeasonBriefSerializer(read_only=True)

    class Meta:
        model = Stage
        fields = (
            "id",
            "season",
            "kind",
            "number",
            "name",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class StageCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Stage.Kind.choices)
    number = serializers.IntegerField(min_value=1)
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    

class TeamSerializer(serializers.ModelSerializer):
    organization = OrganizationBriefSerializer(read_only=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        source="organization",
        write_only=True,
    )
    competitions = CompetitionBriefSerializer(many=True, read_only=True)
    competition_ids = serializers.PrimaryKeyRelatedField(
        queryset=Competition.objects.all(),
        many=True,
        source="competitions",
        write_only=True,
        required=False,
    )
    captain = CaptainBriefSerializer(read_only=True)
    captain_id = serializers.PrimaryKeyRelatedField(
        queryset=Player.objects.all(),
        source="captain",
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Team
        fields = (
            "id",
            "organization",
            "organization_id",
            "name",
            "slug",
            "short_name",
            "logo",
            "competitions",
            "competition_ids",
            "captain",
            "captain_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")

    def validate(self, attrs):
        organization = attrs.get("organization")
        competitions = attrs.get("competitions")
        if organization and competitions:
            mismatched = [
                c.name for c in competitions if c.organization_id != organization.id
            ]
            if mismatched:
                raise serializers.ValidationError(
                    {
                        "competition_ids": (
                            "All competitions must belong to the same organization "
                            f"as the team. Mismatched: {', '.join(mismatched)}."
                        )
                    }
                )
        return attrs


class PlayerSerializer(serializers.ModelSerializer):
    team = TeamBriefSerializer(read_only=True)
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        source="team",
        write_only=True,
    )
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="user",
        write_only=True,
        required=False,
        allow_null=True,
    )
    position_display = serializers.CharField(source="get_position_display", read_only=True)

    class Meta:
        model = Player
        fields = (
            "id",
            "team",
            "team_id",
            "user_id",
            "first_name",
            "last_name",
            "display_name",
            "shirt_number",
            "position",
            "position_display",
            "photo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_shirt_number(self, value):
        if value is None:
            return value
        if value < 1 or value > 99:
            raise serializers.ValidationError("Shirt number must be between 1 and 99.")
        return value

class CompetitionTeamWriteSerializer(serializers.Serializer):
    team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        source="team",
    )