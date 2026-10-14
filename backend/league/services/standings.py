"""
Football standings for a competition.

One engine, two scopes:
  - scope="season": aggregate every FINISHED match in a season.
  - scope="stage":  aggregate every FINISHED match in one stage
                    (a gameweek, or a cup group round).

Cup knockout rounds still compute a table for their matches, but the
frontend should hide the table when the stage is not a group (see the
StageSerializer.is_group flag). The backend does not enforce that
distinction — it just returns the numbers.

Points: 3 for a win, 1 for a draw, 0 for a loss.
Order: Points → Goal Difference → Goals For → Team name.
"""

from league.models import Competition, Season, Stage, Team


POINTS_FOR_WIN = 3
POINTS_FOR_DRAW = 1


def competition_standings(*, competition, season=None, stage=None):
    """
    Compute a standings table for a competition.

    - If `season` is None, the most recent season of the competition is
      used.
    - If `stage` is given, only matches in that stage count.
    - If `stage` is None, all matches in the season count.

    Returns a dict:
        {
            "competition": Competition,
            "season": Season | None,
            "stage": Stage | None,
            "scope": "season" | "stage",
            "rows": [ {team, played, won, drawn, lost, goals_for,
                       goals_against, goal_difference, points, rank}, ... ],
        }
    """
    from matches.models import Match

    if season is None:
        season = _default_season_for_competition(competition)

    if season is None:
        return {
            "competition": competition,
            "season": None,
            "stage": stage,
            "scope": "stage" if stage is not None else "season",
            "rows": [],
        }

    scope = "stage" if stage is not None else "season"

    matches_qs = Match.objects.filter(
        competition=competition,
        stage__season=season,
        status=Match.Status.FINISHED,
    )
    if stage is not None:
        matches_qs = matches_qs.filter(stage=stage)

    # Which teams should appear in the table?
    # - Season scope: every team participating in the competition.
    # - Stage scope: every team that has a match in this stage (played,
    #   live, or scheduled). This gives groups their full membership and
    #   knockout rounds their actual participants.
    if stage is None:
        teams_qs = Team.objects.filter(competitions=competition)
    else:
        from django.db.models import Q
        team_ids = set(
            Match.objects
            .filter(stage=stage)
            .values_list("home_team_id", flat=True)
        ) | set(
            Match.objects
            .filter(stage=stage)
            .values_list("away_team_id", flat=True)
        )
        teams_qs = Team.objects.filter(id__in=team_ids)

    teams_qs = teams_qs.order_by("name")

    table = {t.id: _empty_row(t) for t in teams_qs}

    # Only iterate matches whose teams are in the table. If a match exists
    # whose team is not tracked (shouldn't happen given our filtering, but
    # defensive), skip it.
    for m in matches_qs.only(
        "home_team_id", "away_team_id", "home_score", "away_score"
    ):
        home = table.get(m.home_team_id)
        away = table.get(m.away_team_id)
        if home is None or away is None:
            continue

        home["played"] += 1
        away["played"] += 1
        home["goals_for"] += m.home_score
        home["goals_against"] += m.away_score
        away["goals_for"] += m.away_score
        away["goals_against"] += m.home_score

        if m.home_score > m.away_score:
            home["won"] += 1
            home["points"] += POINTS_FOR_WIN
            away["lost"] += 1
        elif m.home_score < m.away_score:
            away["won"] += 1
            away["points"] += POINTS_FOR_WIN
            home["lost"] += 1
        else:
            home["drawn"] += 1
            away["drawn"] += 1
            home["points"] += POINTS_FOR_DRAW
            away["points"] += POINTS_FOR_DRAW

    rows = []
    for row in table.values():
        row["goal_difference"] = row["goals_for"] - row["goals_against"]
        rows.append(row)

    rows.sort(key=lambda r: (
        -r["points"],
        -r["goal_difference"],
        -r["goals_for"],
        r["team"].name.lower(),
    ))
    for i, r in enumerate(rows, start=1):
        r["rank"] = i

    return {
        "competition": competition,
        "season": season,
        "stage": stage,
        "scope": scope,
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _empty_row(team):
    return {
        "team": team,
        "played": 0,
        "won": 0,
        "drawn": 0,
        "lost": 0,
        "goals_for": 0,
        "goals_against": 0,
        "goal_difference": 0,
        "points": 0,
    }


def _default_season_for_competition(competition):
    """
    The most recent ACTIVE season; else the most recent by start_date;
    else the most recently created.
    """
    active = (
        Season.objects
        .filter(competition=competition, status=Season.Status.ACTIVE)
        .order_by("-start_date", "-id")
        .first()
    )
    if active is not None:
        return active
    return (
        Season.objects
        .filter(competition=competition)
        .order_by("-start_date", "-id")
        .first()
    )