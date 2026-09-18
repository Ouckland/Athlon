from django.db import models

from league.models import Competition, Player, Team


class Match(models.Model):
    """
    A single fixture between two teams inside a competition.

    Score fields (home_score / away_score) are cached, derived values that are
    recomputed from GOAL MatchEvents via the matches service layer. They are
    never meant to be written to directly by callers.
    """

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        LIVE = "LIVE", "Live"
        HALFTIME = "HALFTIME", "Half-time"
        FINISHED = "FINISHED", "Finished"
        POSTPONED = "POSTPONED", "Postponed"
        CANCELLED = "CANCELLED", "Cancelled"

    competition = models.ForeignKey(
        Competition, on_delete=models.CASCADE, related_name="matches"
    )

    stage = models.ForeignKey(
        "league.Stage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="matches",
    )

    home_team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="home_matches"
    )
    away_team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="away_matches"
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.SCHEDULED
    )
    kickoff_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    home_score = models.PositiveSmallIntegerField(default=0)
    away_score = models.PositiveSmallIntegerField(default=0)
    minute = models.PositiveSmallIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-kickoff_at", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(home_team=models.F("away_team")),
                name="match_home_away_teams_differ",
            ),
        ]
        indexes = [
            models.Index(fields=["competition", "status"]),
            models.Index(fields=["kickoff_at"]),
            models.Index(fields=["stage"]),
        ]

    def __str__(self):
        return f"{self.home_team} vs {self.away_team}"


class MatchEvent(models.Model):
    """
    A discrete, timestamped event within a match (goal, card, sub, whistle).

    Events are the source of truth. Match.home_score/away_score, Match.minute,
    and Match.status are derived from them by the matches service layer.
    """

    class Type(models.TextChoices):
        GOAL = "GOAL", "Goal"
        YELLOW = "YELLOW", "Yellow Card"
        RED = "RED", "Red Card"
        SUBSTITUTION = "SUBSTITUTION", "Substitution"
        HALFTIME = "HALFTIME", "Half-time"
        FULLTIME = "FULLTIME", "Full-time"

    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name="events"
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    minute = models.PositiveSmallIntegerField()

    team = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    # Primary actor: scorer, booked player, or player coming OFF.
    player = models.ForeignKey(
        Player,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    # Secondary actor: player coming ON (substitutions only).
    related_player = models.ForeignKey(
        Player,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="related_events",
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["minute", "created_at"]
        indexes = [
            models.Index(fields=["match", "type"]),
            models.Index(fields=["match", "minute"]),
        ]

    def __str__(self):
        return f"{self.get_type_display()} @ {self.minute}' — {self.match}"

class MatchLineup(models.Model):
    """
    A player's appearance in a match. Rows are created in bulk by
    submit_lineup() BEFORE the match starts, and mutated in place as
    substitutions and full-time are recorded.

    - is_starter=True  -> player was in the starting XI
    - is_starter=False -> player was on the bench (bench_order set)
    - subbed_on_minute is only meaningful for bench players who entered
    - subbed_off_minute is closed at full-time for active players
    """

    match = models.ForeignKey(
        Match, on_delete=models.CASCADE, related_name="lineup_entries"
    )
    team = models.ForeignKey(
        "league.Team", on_delete=models.CASCADE, related_name="match_lineups"
    )
    player = models.ForeignKey(
        "league.Player", on_delete=models.CASCADE, related_name="match_lineups"
    )
    is_starter = models.BooleanField(default=False)
    bench_order = models.PositiveSmallIntegerField(null=True, blank=True)
    subbed_on_minute = models.PositiveSmallIntegerField(null=True, blank=True)
    subbed_off_minute = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["match", "player"],
                name="uniq_lineup_entry_per_match_player",
            ),
        ]
        indexes = [
            models.Index(fields=["match", "team"]),
            models.Index(fields=["match", "is_starter"]),
        ]

    def __str__(self):
        role = "XI" if self.is_starter else "BENCH"
        return f"{role} {self.player} @ {self.match}"