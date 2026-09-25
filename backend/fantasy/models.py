from django.conf import settings
from django.db import models

from .constants import DEFAULT_STARTING_BUDGET


class FantasyTeam(models.Model):
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
    starting_budget = models.DecimalField(
        max_digits=6, decimal_places=1, default=DEFAULT_STARTING_BUDGET
    )
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



class FantasyPlayerPrice(models.Model):
    """
    A player's fantasy price. One price per player globally.

    If the player has no row here, they are not selectable in a fantasy
    squad — set_squad() rejects selections containing un-priced players.
    """

    player = models.OneToOneField(
        "league.Player",
        on_delete=models.CASCADE,
        related_name="fantasy_price",
    )
    price = models.DecimalField(max_digits=5, decimal_places=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-price"]

    def __str__(self):
        return f"{self.player} = {self.price}"

class FantasyPlayerSelection(models.Model):
    fantasy_team = models.ForeignKey(
        FantasyTeam, on_delete=models.CASCADE, related_name="selections"
    )
    stage = models.ForeignKey(
        "league.Stage", on_delete=models.CASCADE, related_name="fantasy_selections"
    )
    player = models.ForeignKey(
        "league.Player", on_delete=models.CASCADE, related_name="fantasy_selections"
    )
    is_starter = models.BooleanField(default=False)
    is_captain = models.BooleanField(default=False)
    is_free_hit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["fantasy_team", "stage", "player", "is_free_hit"],
                name="uniq_player_per_team_stage_and_hit",
            ),
        ]
        indexes = [
            models.Index(fields=["fantasy_team", "stage", "is_free_hit", "is_starter"]),
            models.Index(fields=["fantasy_team", "stage", "is_free_hit", "is_captain"]),
        ]

    def __str__(self):
        role = "C" if self.is_captain else ("S" if self.is_starter else "B")
        fh = " [FH]" if self.is_free_hit else ""
        return f"{self.player} [{role}]{fh} stage={self.stage_id}"


class FantasyTransfer(models.Model):
    fantasy_team = models.ForeignKey(
        FantasyTeam, on_delete=models.CASCADE, related_name="transfers"
    )
    stage = models.ForeignKey(
        "league.Stage", on_delete=models.CASCADE, related_name="fantasy_transfers"
    )
    player_out = models.ForeignKey(
        "league.Player", on_delete=models.PROTECT,
        related_name="fantasy_transfers_out",
    )
    player_in = models.ForeignKey(
        "league.Player", on_delete=models.PROTECT,
        related_name="fantasy_transfers_in",
    )
    counts_toward_limit = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["fantasy_team", "stage"]),
            models.Index(fields=["fantasy_team", "stage", "counts_toward_limit"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(player_out=models.F("player_in")),
                name="fantasy_transfer_out_differs_from_in",
            ),
        ]

    def __str__(self):
        marker = "" if self.counts_toward_limit else " (chip)"
        return f"{self.player_out} → {self.player_in}{marker} ({self.fantasy_team.name}, stage {self.stage_id})"


class FantasyChipUse(models.Model):
    """
    Records one chip use by a fantasy team for a specific gameweek.
    Constraints: one use of each chip per season; one chip per gameweek.
    """

    class Chip(models.TextChoices):
        WILDCARD = "WILDCARD", "Wildcard"
        FREE_HIT = "FREE_HIT", "Free Hit"
        BENCH_BOOST = "BENCH_BOOST", "Bench Boost"
        TRIPLE_CAPTAIN = "TRIPLE_CAPTAIN", "Triple Captain"

    fantasy_team = models.ForeignKey(
        FantasyTeam, on_delete=models.CASCADE, related_name="chip_uses"
    )
    season = models.ForeignKey(
        "league.Season", on_delete=models.CASCADE, related_name="chip_uses"
    )
    stage = models.ForeignKey(
        "league.Stage", on_delete=models.CASCADE, related_name="chip_uses"
    )
    chip_type = models.CharField(max_length=20, choices=Chip.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["fantasy_team", "season", "chip_type"],
                name="uniq_chip_per_team_season",
            ),
            models.UniqueConstraint(
                fields=["fantasy_team", "stage"],
                name="uniq_chip_per_team_stage",
            ),
        ]

    def __str__(self):
        return f"{self.chip_type} for {self.fantasy_team.name} @ stage {self.stage_id}"