from django.conf import settings
from django.db import models


class FantasyTeam(models.Model):
    """
    A user's fantasy participation in one (competition, season).

    A user may have many fantasy teams — one per competition/season pair.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fantasy_teams",
    )
    competition = models.ForeignKey(
        "league.Competition",
        on_delete=models.CASCADE,
        related_name="fantasy_teams",
    )
    season = models.ForeignKey(
        "league.Season",
        on_delete=models.CASCADE,
        related_name="fantasy_teams",
    )
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "competition", "season"],
                name="uniq_fantasy_team_per_user_comp_season",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.user.email} · {self.competition.name} {self.season.name})"

class FantasyPlayerSelection(models.Model):
    fantasy_team = models.ForeignKey(
        FantasyTeam, on_delete=models.CASCADE, related_name="selections"
    )
    stage = models.ForeignKey(
        "league.Stage",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="fantasy_selections",
    )
    player = models.ForeignKey(
        "league.Player",
        on_delete=models.CASCADE,
        related_name="fantasy_selections",
    )
    is_starter = models.BooleanField(default=False)
    is_captain = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["fantasy_team", "stage", "player"],
                name="uniq_player_per_team_stage",
            ),
        ]
        indexes = [
            models.Index(fields=["fantasy_team", "stage", "is_starter"]),
            models.Index(fields=["fantasy_team", "stage", "is_captain"]),
        ]

    def __str__(self):
        role = "C" if self.is_captain else ("S" if self.is_starter else "B")
        return f"{self.player} [{role}] stage={self.stage_id}"


class FantasyGroup(models.Model):
    """A private fantasy group identified by an invite code."""

    name = models.CharField(max_length=100)
    invite_code = models.CharField(max_length=12, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_fantasy_groups",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} [{self.invite_code}]"


class FantasyGroupMembership(models.Model):
    group = models.ForeignKey(
        FantasyGroup, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fantasy_group_memberships",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["group", "user"],
                name="uniq_user_per_fantasy_group",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} in {self.group.name}"


class FantasyPoints(models.Model):
    """
    Fantasy points a single real player earned in a single match.

    Stored per (match, player) — NOT per fantasy team. Fantasy-team totals are
    aggregated from these rows by fantasy/services/leaderboard.py.

    Source of truth for these points is the MatchEvent table; this row is a
    deterministic derivation that can be wiped and recomputed at any time.
    """

    match = models.ForeignKey(
        "matches.Match", on_delete=models.CASCADE, related_name="fantasy_points"
    )
    player = models.ForeignKey(
        "league.Player",
        on_delete=models.CASCADE,
        related_name="fantasy_points",
    )
    points = models.IntegerField(default=0)
    breakdown = models.JSONField(default=dict, blank=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["match", "player"],
                name="uniq_fantasy_points_per_match_player",
            ),
        ]
        indexes = [
            models.Index(fields=["match"]),
            models.Index(fields=["player"]),
        ]

    def __str__(self):
        return f"{self.player} @ {self.match}: {self.points} pts"