from django.db import transaction
from django.db.models import Q

from league.models import Player
from matches.models import Match, MatchLineup


MIN_STARTERS = 11
MAX_BENCH = 4


def submit_lineup(*, match, team, starters, bench):
    """
    Replace the team's lineup for a match.

    - Starters must be exactly 11.
    - Bench must be 0..4 players.
    - No overlaps, no duplicates, all players on the given team.
    - Only allowed while the match is SCHEDULED.
    """
    if match.status != Match.Status.SCHEDULED:
        raise ValueError("Lineups can only be submitted before the match starts.")

    if team.id not in (match.home_team_id, match.away_team_id):
        raise ValueError("Team is not part of this match.")

    starters = list(starters)
    bench = list(bench)

    if len(starters) != MIN_STARTERS:
        raise ValueError(f"Lineup requires exactly {MIN_STARTERS} starters.")
    if len(bench) > MAX_BENCH:
        raise ValueError(f"Bench can have at most {MAX_BENCH} players.")

    starter_ids = [p.id for p in starters]
    bench_ids = [p.id for p in bench]

    if len(set(starter_ids)) != len(starter_ids):
        raise ValueError("Duplicate players in the starting XI.")
    if len(set(bench_ids)) != len(bench_ids):
        raise ValueError("Duplicate players on the bench.")
    if set(starter_ids) & set(bench_ids):
        raise ValueError("A player cannot be both a starter and a bench player.")

    all_ids = starter_ids + bench_ids
    if not all_ids:
        raise ValueError("Lineup is empty.")

    # Every player must belong to the given team.
    players = Player.objects.filter(id__in=all_ids).only("id", "team_id")
    by_id = {p.id: p for p in players}
    if len(by_id) != len(all_ids):
        raise ValueError("One or more players do not exist.")
    for pid in all_ids:
        if by_id[pid].team_id != team.id:
            raise ValueError("All players must belong to the submitting team.")

    with transaction.atomic():
        MatchLineup.objects.filter(match=match, team=team).delete()
        MatchLineup.objects.bulk_create(
            [
                MatchLineup(match=match, team=team, player=p, is_starter=True)
                for p in starters
            ]
            + [
                MatchLineup(
                    match=match,
                    team=team,
                    player=p,
                    is_starter=False,
                    bench_order=i,
                )
                for i, p in enumerate(bench)
            ]
        )
    return MatchLineup.objects.filter(match=match, team=team)


def record_substitution_in_lineup(*, match, player_off, player_on, minute):
    """
    Mutate lineup entries for a SUBSTITUTION event.
    Called from record_match_event() inside the existing transaction.
    """
    off_entry = MatchLineup.objects.filter(match=match, player=player_off).first()
    on_entry = MatchLineup.objects.filter(match=match, player=player_on).first()

    if off_entry is None:
        raise ValueError("Player coming off is not in the submitted lineup.")
    if on_entry is None:
        raise ValueError("Player coming on is not in the submitted lineup.")

    if on_entry.is_starter:
        raise ValueError("Player coming on must be a bench player.")
    if on_entry.subbed_on_minute is not None:
        raise ValueError("Player coming on has already entered the match.")
    if off_entry.subbed_off_minute is not None:
        raise ValueError("Player coming off is already off the pitch.")

    off_entry.subbed_off_minute = minute
    off_entry.save(update_fields=["subbed_off_minute", "updated_at"])

    on_entry.subbed_on_minute = minute
    on_entry.save(update_fields=["subbed_on_minute", "updated_at"])


def close_lineup_at_fulltime(match, fulltime_minute):
    """
    At full-time, close every active lineup entry (starters still on and
    bench players who entered). Unused bench players (no subbed_on_minute)
    stay at 0 minutes.
    """
    MatchLineup.objects.filter(match=match, subbed_off_minute__isnull=True).filter(
        Q(is_starter=True) | Q(subbed_on_minute__isnull=False)
    ).update(subbed_off_minute=fulltime_minute)


def get_player_minutes(player, match):
    """
    Minutes played by `player` in `match`, using the submitted lineup as
    the source of truth.

    - Starter, no sub-off: minutes = current minute
    - Starter, subbed off: minutes = subbed_off_minute
    - Bench, entered: minutes = current - subbed_on_minute
    - Bench, never entered: 0
    - Not in lineup: 0
    """
    entry = MatchLineup.objects.filter(match=match, player=player).first()
    if entry is None:
        return 0

    current = match.minute or 0

    if entry.is_starter:
        end = entry.subbed_off_minute if entry.subbed_off_minute is not None else current
        return max(0, end)

    if entry.subbed_on_minute is None:
        return 0
    end = entry.subbed_off_minute if entry.subbed_off_minute is not None else current
    return max(0, end - entry.subbed_on_minute)