from django.db import IntegrityError
from django.utils.text import slugify

from league.models import Competition, Organization, Player, Season, Stage, Team

class LeagueError(Exception):
    """Raised when a league domain rule is violated."""


def _unique_slug(model, base_slug, organization=None, max_length=200):
    """Return a slug that is unique within (organization, model) scope."""
    base_slug = (base_slug or "item")[:max_length]
    candidate = base_slug
    qs = model.objects.all()
    if organization is not None:
        qs = qs.filter(organization=organization)
    i = 2
    while qs.filter(slug=candidate).exists():
        suffix = f"-{i}"
        candidate = f"{base_slug[: max_length - len(suffix)]}{suffix}"
        i += 1
    return candidate


def create_organization(*, name, description="", logo=None, slug=None):
    if not name or not name.strip():
        raise LeagueError("Organization name is required.")
    return Organization.objects.create(
        name=name.strip(),
        slug=_unique_slug(Organization, slug or slugify(name), max_length=220),
        description=description or "",
        logo=logo,
    )


def create_competition(
    *,
    organization,
    name,
    description="",
    season="",
    status=Competition.Status.DRAFT,
    type=Competition.Type.LEAGUE,
    start_date=None,
    end_date=None,
    slug=None,
):
    if not name or not name.strip():
        raise LeagueError("Competition name is required.")
    if status not in Competition.Status.values:
        raise LeagueError("Invalid competition status.")
    if type not in Competition.Type.values:
        raise LeagueError("Invalid competition type.")
    return Competition.objects.create(
        organization=organization,
        name=name.strip(),
        slug=_unique_slug(
            Competition,
            slug or slugify(name),
            organization=organization,
            max_length=220,
        ),
        description=description or "",
        season=season or "",
        status=status,
        type=type,
        start_date=start_date,
        end_date=end_date,
    )


def create_team(*, organization, name, short_name="", logo=None, slug=None):
    if not name or not name.strip():
        raise LeagueError("Team name is required.")
    return Team.objects.create(
        organization=organization,
        name=name.strip(),
        slug=_unique_slug(
            Team,
            slug or slugify(name),
            organization=organization,
            max_length=220,
        ),
        short_name=short_name or "",
        logo=logo,
    )


def add_player_to_team(
    *,
    team,
    first_name,
    last_name="",
    display_name="",
    shirt_number=None,
    position,
    photo=None,
    user=None,
):
    if not first_name or not first_name.strip():
        raise LeagueError("Player first name is required.")
    if position not in Player.Position.values:
        raise LeagueError("Invalid player position.")
    return Player.objects.create(
        team=team,
        user=user,
        first_name=first_name.strip(),
        last_name=(last_name or "").strip(),
        display_name=(display_name or "").strip(),
        shirt_number=shirt_number,
        position=position,
        photo=photo,
    )


def set_team_captain(*, team, player):
    """Set or clear the captain. Captain must belong to `team`."""
    if player is None:
        team.captain = None
        team.save(update_fields=["captain", "updated_at"])
        return team
    if player.team_id != team.id:
        raise LeagueError("Captain must belong to the team.")
    team.captain = player
    team.save(update_fields=["captain", "updated_at"])
    return team

def set_team_competitions(*, team, competitions):
    """
    Assign competitions to a team.

    Every competition must belong to the same organization as the team.
    Raises LeagueError on mismatch.
    """
    comps = list(competitions)
    mismatched = [
        c.name for c in comps if c.organization_id != team.organization_id
    ]
    if mismatched:
        raise LeagueError(
            "Competitions must belong to the same organization as the team. "
            f"Mismatched: {', '.join(mismatched)}."
        )
    team.competitions.set(comps)
    return team


def _unique_season_slug(competition, base_slug, max_length=120):
    """Slug unique within a competition's seasons."""
    base_slug = (base_slug or "season")[:max_length]
    candidate = base_slug
    i = 2
    while Season.objects.filter(competition=competition, slug=candidate).exists():
        suffix = f"-{i}"
        candidate = f"{base_slug[: max_length - len(suffix)]}{suffix}"
        i += 1
    return candidate


def create_season(
    *,
    competition,
    name,
    slug=None,
    status=Season.Status.DRAFT,
    start_date=None,
    end_date=None,
):
    if not name or not name.strip():
        raise LeagueError("Season name is required.")
    if status not in Season.Status.values:
        raise LeagueError("Invalid season status.")
    if start_date and end_date and start_date > end_date:
        raise LeagueError("Season end date must be on or after start date.")

    return Season.objects.create(
        competition=competition,
        name=name.strip(),
        slug=_unique_season_slug(competition, slug or slugify(name)),
        status=status,
        start_date=start_date,
        end_date=end_date,
    )


def create_stage(
    *,
    season,
    kind,
    number,
    name="",
    start_date=None,
    end_date=None,
):
    if kind not in Stage.Kind.values:
        raise LeagueError("Invalid stage kind.")
    if number is None or number < 1:
        raise LeagueError("Stage number must be a positive integer.")
    if start_date and end_date and start_date > end_date:
        raise LeagueError("Stage end date must be on or after start date.")

    competition_type = season.competition.type
    if competition_type == Competition.Type.LEAGUE and kind != Stage.Kind.GAMEWEEK:
        raise LeagueError("League competitions accept only GAMEWEEK stages.")
    if competition_type == Competition.Type.CUP and kind != Stage.Kind.ROUND:
        raise LeagueError("Cup competitions accept only ROUND stages.")

    # Pre-check for a clean error; DB constraint still protects against races.
    if Stage.objects.filter(season=season, number=number).exists():
        raise LeagueError(
            "A stage with that number already exists in this season."
        )

    try:
        return Stage.objects.create(
            season=season,
            kind=kind,
            number=number,
            name=name or "",
            start_date=start_date,
            end_date=end_date,
        )
    except IntegrityError as exc:
        raise LeagueError(
            "A stage with that number already exists in this season."
        ) from exc


def add_team_to_competition(*, competition, team):
    """
    Add a team to a competition's participating teams.

    Rules:
      - Team must belong to the same organization as the competition.
      - Idempotent: re-adding an already-participating team is a no-op.
    """
    if team.organization_id != competition.organization_id:
        raise LeagueError(
            "Team organization must match the competition's organization."
        )
    if not competition.teams.filter(id=team.id).exists():
        competition.teams.add(team)
    return team


def remove_team_from_competition(*, competition, team):
    """
    Remove a team from a competition's participating teams.

    Rejects removal if:
      - the team is not currently participating, or
      - the team has any match in this competition (removing participation
        while matches still reference the team would leave the competition
        in an inconsistent state — the lineup and match APIs assume a match's
        teams are participating in the match's competition).
    """
    if not competition.teams.filter(id=team.id).exists():
        raise LeagueError("Team is not participating in this competition.")

    # Runtime import to preserve the dependency direction (league -> matches
    # is allowed at runtime; a module-level import would create a cycle since
    # matches.models imports league.models).
    from django.db.models import Q
    from matches.models import Match

    if Match.objects.filter(competition=competition).filter(
        Q(home_team=team) | Q(away_team=team)
    ).exists():
        raise LeagueError(
            "Cannot remove a team that has matches in this competition."
        )

    competition.teams.remove(team)

