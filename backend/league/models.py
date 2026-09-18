from django.conf import settings
from django.db import models


class Organization(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to="organizations/logos/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Competition(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"

    class Type(models.TextChoices):
        LEAGUE = "LEAGUE", "League"
        CUP = "CUP", "Cup"

    type = models.CharField(
        max_length=8, choices=Type.choices, default=Type.LEAGUE
    )

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="competitions"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    description = models.TextField(blank=True)
    season = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"],
                name="uniq_competition_slug_per_org",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class Team(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="teams"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220)
    short_name = models.CharField(max_length=32, blank=True)
    logo = models.ImageField(upload_to="teams/logos/", null=True, blank=True)
    captain = models.ForeignKey(
        "Player",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="captain_of_teams",
    )
    competitions = models.ManyToManyField(
        Competition, related_name="teams", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "slug"], name="uniq_team_slug_per_org"
            ),
        ]

    def __str__(self):
        return self.name


class Player(models.Model):
    class Position(models.TextChoices):
        GK = "GK", "Goalkeeper"
        DEF = "DEF", "Defender"
        MID = "MID", "Midfielder"
        ATT = "ATT", "Attacker"

    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name="players"
    )
    # Optional link to an Athlon account. Players can exist without a user.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="players",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    display_name = models.CharField(max_length=120, blank=True)
    shirt_number = models.PositiveSmallIntegerField(null=True, blank=True)
    position = models.CharField(max_length=8, choices=Position.choices)
    photo = models.ImageField(upload_to="players/photos/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["team"]),
            models.Index(fields=["position"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "shirt_number"],
                condition=models.Q(shirt_number__isnull=False),
                name="uniq_shirt_number_per_team",
            ),
        ]

    def __str__(self):
        name = self.display_name or f"{self.first_name} {self.last_name}".strip()
        return name or f"Player #{self.pk}"


class Season(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"

    competition = models.ForeignKey(
        Competition, on_delete=models.CASCADE, related_name="seasons"
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["competition", "slug"], name="uniq_season_slug_per_comp"
            ),
        ]

    def __str__(self):
        return f"{self.competition.name} · {self.name}"


class Stage(models.Model):
    """
    A scheduling unit inside a Season.

    - LEAGUE competitions use kind=GAMEWEEK (Matchday 1, 2, 3, ...)
    - CUP competitions use kind=ROUND    (Quarter-final, Semi-final, Final, ...)

    Match and the fantasy engine treat stages identically; only the frontend
    and the service layer care about the kind.
    """

    class Kind(models.TextChoices):
        GAMEWEEK = "GAMEWEEK", "Gameweek"
        ROUND = "ROUND", "Round"

    season = models.ForeignKey(
        Season, on_delete=models.CASCADE, related_name="stages"
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=100, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["season", "number"]
        constraints = [
            models.UniqueConstraint(
                fields=["season", "number"], name="uniq_stage_number_per_season"
            ),
        ]

    def __str__(self):
        label = self.name or f"{self.get_kind_display()} {self.number}"
        return f"{self.season} · {label}"