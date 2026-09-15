from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Competition, Organization, Player, Team

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
            "season",
            "status",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "slug", "created_at", "updated_at")


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