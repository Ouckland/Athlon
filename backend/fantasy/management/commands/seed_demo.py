"""
Seed Athlon with deterministic demo data for local development and the
frontend preview.

    python manage.py seed_demo
    python manage.py seed_demo --reset

All demo data is identified by:
  * organization slug `funaab-sports-demo`
  * email domain `demo.athlon.local`

`--reset` deletes only these, then re-seeds. The command never touches
arbitrary development data.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from league.models import (
    Competition,
    Organization,
    Player,
    Season,
    Stage,
    Team,
)
from league.services import (
    add_player_to_team,
    add_team_manager,
    add_team_to_competition,
    create_competition,
    create_organization,
    create_season,
    create_stage,
    create_team,
)
from matches.models import Match, MatchEvent
from matches.services import create_match, record_match_event
from matches.services.lineup import submit_lineup

from fantasy.models import (
    FantasyChipUse,
    FantasyPlayerSelection,
    FantasyPoints,
    FantasyTeam,
    FantasyTransfer,
)
from fantasy.services import (
    activate_chip,
    create_fantasy_team,
    create_starting_squad,
    make_transfer,
    set_player_price,
)


User = get_user_model()


# ---------------------------------------------------------------------------
# Deterministic data pools
# ---------------------------------------------------------------------------
FIRST_NAMES = [
    "Ade", "Bolu", "Chidi", "Dayo", "Emeka", "Femi", "Gani", "Hassan",
    "Idris", "Jide", "Kunle", "Lekan", "Musa", "Nnamdi", "Ola", "Peter",
    "Quam", "Rasheed", "Segun", "Tunde", "Uche", "Victor", "Wale", "Yusuf",
    "Zubair", "Ayo", "Bimpe", "Cynthia", "Damilare", "Ebenezer", "Funke",
    "Grace", "Hope", "Ibrahim", "Joy", "Kemi", "Lola", "Mary", "Nike",
    "Ope", "Precious", "Rita", "Sade", "Tola", "Uzo", "Vera", "Wumi",
    "Yemi", "Zainab", "Adeola", "Bukola", "Charles", "Doris",
]
LAST_NAMES = [
    "Adeyemi", "Balogun", "Chukwu", "Dada", "Eze", "Fashola", "Gbadamosi",
    "Hassan", "Ibrahim", "Jaiyeola", "Kalu", "Lawal", "Momoh", "Nwachukwu",
    "Okafor", "Peters", "Quadri", "Rotimi", "Sanni", "Tijani", "Uche",
    "Vincent", "Williams", "Yakubu", "Zubair", "Adeleke", "Bello", "Coker",
    "Durojaiye", "Ekwueme", "Falade", "George", "Hammed", "Ige", "Johnson",
    "Kuti", "Lambo", "Mbah", "Nwosu", "Obi", "Quansah", "Sanusi",
]

TEAM_SPECS = [
    ("Agric United", "AGU"),
    ("Computing FC", "CMP"),
    ("Engineering Stars", "ENG"),
    ("Science City", "SCI"),
    ("Management FC", "MGT"),
    ("Veterinary Warriors", "VET"),
]

FANTASY_TEAM_NAMES = [
    "Korede XI", "The Ballers", "Code FC", "Campus Kings", "League Legends",
]

# 15 players per team: 2 GK, 5 DEF, 5 MID, 3 ATT
PLAYER_POSITIONS = ["GK"] * 2 + ["DEF"] * 5 + ["MID"] * 5 + ["ATT"] * 3

# Starting XI: 1 GK, 4 DEF, 4 MID, 2 ATT
STARTER_INDICES = [0, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13]
# Bench: 1 GK, 1 DEF, 1 MID, 1 ATT
BENCH_INDICES = [1, 6, 11, 14]
# Captain = first MID
CAPTAIN_INDEX = 7

PRICE_BASE = {
    "GK": Decimal("4.5"),
    "DEF": Decimal("4.5"),
    "MID": Decimal("5.5"),
    "ATT": Decimal("6.5"),
}


class Command(BaseCommand):
    help = "Seed Athlon with deterministic demo data."

    DEMO_ORG_SLUG = "funaab-sports-demo"
    DEMO_EMAIL_DOMAIN = "demo.athlon.local"
    DEMO_PASSWORD = "DemoPassword!2026"

    # ------------------------------------------------------------------
    # CLI
    # ------------------------------------------------------------------
    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before re-seeding.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            self._reset()
        elif Organization.objects.filter(slug=self.DEMO_ORG_SLUG).exists():
            self.stdout.write(self.style.WARNING(
                "Demo data already exists. Re-run with --reset to recreate it."
            ))
            return

        self._seed()
        self._print_summary()

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------
    def _reset(self):
        User.objects.filter(
            email__endswith=f"@{self.DEMO_EMAIL_DOMAIN}"
        ).delete()
        Organization.objects.filter(slug=self.DEMO_ORG_SLUG).delete()
        self.stdout.write(self.style.WARNING("Demo data cleared."))

    def _create_demo_cup(self, *, org, teams, players_by_team_id):
        """
        A fictional cup with:
          - one group stage (kind=ROUND, is_group=True) with matches
          - one knockout round (kind=ROUND, is_group=False) with matches
        So the frontend can demo both the table and the "hide table for
        knockout" behavior.
        """
        cup = create_competition(
            organization=org,
            name="FUNAAB Cup",
            description="Demo knockout cup.",
            type=Competition.Type.CUP,
            slug="funaab-cup-demo",
        )
        cup_season = create_season(
            competition=cup,
            name="2026 Cup",
            slug="2026-cup",
        )
        group_stage = create_stage(
            season=cup_season, kind=Stage.Kind.ROUND, number=1,
            name="Group Stage", is_group=True,
        )
        quarter_stage = create_stage(
            season=cup_season, kind=Stage.Kind.ROUND, number=2,
            name="Quarter-final", is_group=False,
        )

        for t in teams:
            add_team_to_competition(competition=cup, team=t)

        # Group stage: three matches, all finished, on the same day.
        from django.utils import timezone
        kickoff = timezone.now() - timedelta(days=10)
        group_pairings = [
            (teams[0], teams[1]),
            (teams[2], teams[3]),
            (teams[4], teams[5]),
        ]
        for home, away in group_pairings:
            m = create_match(
                competition=cup, home_team=home, away_team=away,
                stage=group_stage, kickoff_at=kickoff,
            )
            Match.objects.filter(pk=m.pk).update(status=Match.Status.FINISHED)
            m.refresh_from_db()
            # Simple results: home team wins 1-0.
            record_match_event(
                match=m, event_type=MatchEvent.Type.GOAL, minute=30,
                team=home, player=list(players_by_team_id[home.id])[12],
            )
            record_match_event(
                match=m, event_type=MatchEvent.Type.FULLTIME, minute=90,
            )

        # Quarter-final: two matches, one finished, one upcoming.
        qf_kickoff_done = timezone.now() - timedelta(days=5)
        qf_kickoff_upcoming = timezone.now() + timedelta(days=3)
        qf_pairings = [
            (teams[0], teams[2], qf_kickoff_done, True),
            (teams[4], teams[1], qf_kickoff_upcoming, False),
        ]
        for home, away, ko, finished in qf_pairings:
            m = create_match(
                competition=cup, home_team=home, away_team=away,
                stage=quarter_stage, kickoff_at=ko,
            )
            if finished:
                Match.objects.filter(pk=m.pk).update(status=Match.Status.FINISHED)
                m.refresh_from_db()
                record_match_event(
                    match=m, event_type=MatchEvent.Type.GOAL, minute=55,
                    team=home, player=list(players_by_team_id[home.id])[13],
                )
                record_match_event(
                    match=m, event_type=MatchEvent.Type.FULLTIME, minute=90,
                )

    # ------------------------------------------------------------------
    # Seed
    # ------------------------------------------------------------------
    def _seed(self):
        # -- 1. Organization, competition, season ------------------------
        org = create_organization(
            name="FUNAAB Sports",
            description="Demo organization.",
            slug=self.DEMO_ORG_SLUG,
        )
        competition = create_competition(
            organization=org,
            name="FUNAAB Football League",
            description="Demo league.",
            type=Competition.Type.LEAGUE,
            slug="funaab-football-league-demo",
        )
        season = create_season(
            competition=competition,
            name="2026 Season",
            slug="2026-season",
        )

        # -- 2. Gameweeks ------------------------------------------------
        gw1 = create_stage(season=season, kind=Stage.Kind.GAMEWEEK, number=1, name="Gameweek 1")
        gw2 = create_stage(season=season, kind=Stage.Kind.GAMEWEEK, number=2, name="Gameweek 2")
        gw3 = create_stage(season=season, kind=Stage.Kind.GAMEWEEK, number=3, name="Gameweek 3")
        gw4 = create_stage(season=season, kind=Stage.Kind.GAMEWEEK, number=4, name="Gameweek 4")
        gw5 = create_stage(season=season, kind=Stage.Kind.GAMEWEEK, number=5, name="Gameweek 5")

        # -- 13. Cup with a group stage + knockout -----------------------
        self._create_demo_cup(org=org, teams=teams, players_by_team_id=players_by_team_id)
        
        # -- 3. Teams + participation ------------------------------------
        teams = []
        for name, short in TEAM_SPECS:
            t = create_team(organization=org, name=name, short_name=short)
            add_team_to_competition(competition=competition, team=t)
            teams.append(t)

        # -- 4. Players + prices -----------------------------------------
        players_by_team_id = {}
        for t_idx, team in enumerate(teams):
            players_by_team_id[team.id] = self._create_team_players(team, t_idx)

        # -- 5. Users ----------------------------------------------------
        self._create_user(
            email=f"admin@{self.DEMO_EMAIL_DOMAIN}",
            role=User.Role.ADMIN,
            display_name="Demo Admin",
        )
        self._create_user(
            email=f"scout@{self.DEMO_EMAIL_DOMAIN}",
            role=User.Role.SCOUT,
            display_name="Demo Scout",
        )
        regular_users = []
        for i in range(1, 6):
            regular_users.append(self._create_user(
                email=f"user{i}@{self.DEMO_EMAIL_DOMAIN}",
                role=User.Role.USER,
                display_name=f"Demo User {i}",
            ))

        # -- 6. Team managers --------------------------------------------
        for i in range(5):
            add_team_manager(team=teams[i], user=regular_users[i])

        # -- 7. Fantasy teams --------------------------------------------
        fantasy_teams = []
        for i, u in enumerate(regular_users):
            ft = create_fantasy_team(
                user=u,
                name=FANTASY_TEAM_NAMES[i],
                competition=competition,
                season=season,
            )
            fantasy_teams.append(ft)

        # -- 8. GW1: completed, with chips -------------------------------
        gw1_matches = self._create_matches(gw1, competition, teams)
        self._create_squads_for_all(fantasy_teams, gw1, players_by_team_id)
        activate_chip(fantasy_team=fantasy_teams[3], stage=gw1, chip_type="BENCH_BOOST")
        activate_chip(fantasy_team=fantasy_teams[4], stage=gw1, chip_type="TRIPLE_CAPTAIN")
        self._play_out_stage(
            gw1_matches, players_by_team_id,
            offset_days=-14,
            home_goals=[1, 2, 0],
            away_goals=[0, 1, 0],
        )

        # -- 9. GW2: completed, no chips ---------------------------------
        gw2_matches = self._create_matches(gw2, competition, teams)
        self._create_squads_for_all(fantasy_teams, gw2, players_by_team_id)
        self._play_out_stage(
            gw2_matches, players_by_team_id,
            offset_days=-7,
            home_goals=[2, 1, 1],
            away_goals=[1, 1, 0],
        )

        # -- 10. GW3: mixed LIVE / HALFTIME / SCHEDULED, with Free Hit ---
        gw3_matches = self._create_matches(gw3, competition, teams)
        self._create_squads_for_all(fantasy_teams, gw3, players_by_team_id)
        # Free Hit for user3 (fantasy_teams[2]) using a different team's squad
        fh_squad = self._build_squad_payload(
            list(players_by_team_id[teams[3].id])
        )
        activate_chip(
            fantasy_team=fantasy_teams[2], stage=gw3,
            chip_type="FREE_HIT", selections=fh_squad,
        )
        self._play_out_mixed_stage(gw3_matches, players_by_team_id)

        # -- 11. GW4: upcoming, with a normal transfer and a Wildcard ----
        gw4_matches = self._create_matches(gw4, competition, teams)
        self._create_squads_for_all(fantasy_teams, gw4, players_by_team_id)
        # Normal transfer for user1
        self._make_demo_transfer(
            fantasy_team=fantasy_teams[0], stage=gw4,
            own_players=list(players_by_team_id[teams[0].id]),
            replacement_players=list(players_by_team_id[teams[1].id]),
        )
        # Wildcard + two transfers for user2
        activate_chip(
            fantasy_team=fantasy_teams[1], stage=gw4, chip_type="WILDCARD"
        )
        self._make_demo_transfer(
            fantasy_team=fantasy_teams[1], stage=gw4,
            own_players=list(players_by_team_id[teams[1].id]),
            replacement_players=list(players_by_team_id[teams[2].id]),
        )

        # -- 12. GW5: fixtures spread across the next 7 days -------------
        #     Lineups pre-submitted so the frontend has realistic data to
        #     render and managers have something to edit.
        self._create_week_fixtures(
            competition=competition,
            season=season,
            stage=gw5,
            teams=teams,
            players_by_team_id=players_by_team_id,
        )

    # ==================================================================
    # Internals
    # ==================================================================
    def _create_user(self, *, email, role, display_name):
        return User.objects.create_user(
            email=email,
            password=self.DEMO_PASSWORD,
            role=role,
            display_name=display_name,
        )

    def _create_team_players(self, team, team_idx):
        players = []
        counters = {"GK": 0, "DEF": 0, "MID": 0, "ATT": 0}
        for i, pos in enumerate(PLAYER_POSITIONS):
            pos_idx = counters[pos]
            counters[pos] += 1
            fn = FIRST_NAMES[(team_idx * 13 + i * 3) % len(FIRST_NAMES)]
            ln = LAST_NAMES[(team_idx * 7 + i * 5 + 3) % len(LAST_NAMES)]
            p = add_player_to_team(
                team=team,
                first_name=fn,
                last_name=ln,
                display_name=f"{fn} {ln}",
                shirt_number=i + 1,
                position=pos,
            )
            price = (
                PRICE_BASE[pos]
                + Decimal(pos_idx) * Decimal("0.3")
                + Decimal(team_idx) * Decimal("0.1")
            ).quantize(Decimal("0.1"))
            set_player_price(player=p, price=price)
            players.append(p)
        return players

    def _create_matches(self, stage, competition, teams):
        pairings = [
            (teams[0], teams[1]),
            (teams[2], teams[3]),
            (teams[4], teams[5]),
        ]
        matches = []
        for home, away in pairings:
            m = create_match(
                competition=competition,
                home_team=home,
                away_team=away,
                stage=stage,
                kickoff_at=None,   # set later once lineups/chips are done
            )
            matches.append(m)
        return matches

    def _build_squad_payload(self, players):
        return [
            {
                "player_id": p.id,
                "is_starter": i in STARTER_INDICES,
                "is_captain": i == CAPTAIN_INDEX,
            }
            for i, p in enumerate(players)
        ]

    def _create_squads_for_all(self, fantasy_teams, players_by_team_id):
        # Order of fantasy_teams matches order of teams they were built from.
        team_list = list(players_by_team_id.keys())
        for i, ft in enumerate(fantasy_teams):
            players = list(players_by_team_id[team_list[i]])
            selections = self._build_squad_payload(players)
            create_starting_squad(fantasy_team=ft, selections=selections)

    # ------------------------------------------------------------------
    # Playing out a stage
    # ------------------------------------------------------------------
    def _submit_lineups(self, matches, players_by_team_id):
        for m in matches:
            home = list(players_by_team_id[m.home_team_id])
            away = list(players_by_team_id[m.away_team_id])
            submit_lineup(
                match=m, team=m.home_team,
                starters=[home[i] for i in STARTER_INDICES],
                bench=[home[i] for i in BENCH_INDICES],
            )
            submit_lineup(
                match=m, team=m.away_team,
                starters=[away[i] for i in STARTER_INDICES],
                bench=[away[i] for i in BENCH_INDICES],
            )

    def _play_out_stage(self, matches, players_by_team_id, *, offset_days,
                        home_goals, away_goals):
        now = timezone.now()
        kickoff = now + timedelta(days=offset_days)

        self._submit_lineups(matches, players_by_team_id)

        Match.objects.filter(id__in=[m.id for m in matches]).update(
            kickoff_at=kickoff
        )
        for m in matches:
            m.refresh_from_db()

        for idx, m in enumerate(matches):
            self._record_finished_match(
                m, players_by_team_id,
                home_goals[idx], away_goals[idx],
            )

    def _record_finished_match(self, match, players_by_team_id,
                                home_goals, away_goals):
        home = list(players_by_team_id[match.home_team_id])
        away = list(players_by_team_id[match.away_team_id])

        # First half: a goal + a card
        if home_goals >= 1:
            record_match_event(
                match=match, event_type=MatchEvent.Type.GOAL, minute=12,
                team=match.home_team, player=home[12], related_player=home[7],
            )
        if away_goals >= 1:
            record_match_event(
                match=match, event_type=MatchEvent.Type.GOAL, minute=20,
                team=match.away_team, player=away[12], related_player=away[8],
            )
        record_match_event(
            match=match, event_type=MatchEvent.Type.YELLOW, minute=28,
            team=match.away_team, player=away[2],
        )

        record_match_event(
            match=match, event_type=MatchEvent.Type.HALFTIME, minute=45,
        )

        # Second half: a substitution, then a goal in some matches
        record_match_event(
            match=match, event_type=MatchEvent.Type.SUBSTITUTION, minute=60,
            team=match.home_team, player=home[12], related_player=home[14],
        )
        if home_goals >= 2:
            record_match_event(
                match=match, event_type=MatchEvent.Type.GOAL, minute=72,
                team=match.home_team, player=home[13], related_player=home[8],
            )
        if away_goals >= 2:
            record_match_event(
                match=match, event_type=MatchEvent.Type.GOAL, minute=78,
                team=match.away_team, player=away[13], related_player=away[9],
            )

        record_match_event(
            match=match, event_type=MatchEvent.Type.FULLTIME, minute=90,
        )

    def _play_out_mixed_stage(self, matches, players_by_team_id):
        now = timezone.now()

        # All lineups first, while the stage is still SCHEDULED
        self._submit_lineups(matches, players_by_team_id)

        # Kickoff times: live, halftime, future
        kickoffs = [now - timedelta(minutes=50),
                    now - timedelta(minutes=47),
                    now + timedelta(hours=2)]
        for m, k in zip(matches, kickoffs):
            Match.objects.filter(pk=m.pk).update(kickoff_at=k)
            m.refresh_from_db()

        # Match 0 -> LIVE (goal only)
        m0 = matches[0]
        home0 = list(players_by_team_id[m0.home_team_id])
        away0 = list(players_by_team_id[m0.away_team_id])
        record_match_event(
            match=m0, event_type=MatchEvent.Type.GOAL, minute=15,
            team=m0.home_team, player=home0[12], related_player=home0[7],
        )
        record_match_event(
            match=m0, event_type=MatchEvent.Type.YELLOW, minute=25,
            team=m0.away_team, player=away0[2],
        )

        # Match 1 -> HALFTIME (goal + halftime)
        m1 = matches[1]
        home1 = list(players_by_team_id[m1.home_team_id])
        record_match_event(
            match=m1, event_type=MatchEvent.Type.GOAL, minute=20,
            team=m1.home_team, player=home1[12], related_player=home1[8],
        )
        record_match_event(
            match=m1, event_type=MatchEvent.Type.HALFTIME, minute=45,
        )

        # Match 2 stays SCHEDULED (lineup already submitted, no events)

    # ------------------------------------------------------------------
    # Next-7-days fixtures
    # ------------------------------------------------------------------
    def _create_week_fixtures(self, *, competition, season, stage, teams,
                              players_by_team_id):
        """
        Create fixtures spread across the next 7 calendar days.

        - kickoff times are day-relative so the frontend always has
          upcoming matches relative to `now`
        - lineups are pre-submitted so the lineup UI has data to render
        - no events are recorded: every match stays SCHEDULED
        """
        now = timezone.now()

        # Round-robin-ish pairings across the next week.
        # 6 teams -> 15 possible pairings; we use 6 spread across 7 days.
        # Order chosen so no team plays twice on the same day.
        fixtures = [
            # (home_idx, away_idx, days_from_now, hour)
            (0, 1, 1, 15),   # tomorrow 15:00
            (2, 3, 1, 18),   # tomorrow 18:00
            (4, 5, 2, 16),   # +2 days 16:00
            (0, 2, 3, 15),   # +3 days 15:00
            (3, 5, 4, 18),   # +4 days 18:00
            (1, 4, 6, 20),   # +6 days 20:00
        ]

        created = []
        for home_idx, away_idx, days_ahead, hour in fixtures:
            home = teams[home_idx]
            away = teams[away_idx]
            kickoff = (now + timedelta(days=days_ahead)).replace(
                hour=hour, minute=0, second=0, microsecond=0
            )
            m = create_match(
                competition=competition,
                home_team=home,
                away_team=away,
                stage=stage,
                kickoff_at=kickoff,
            )
            created.append(m)

        # Pre-submit lineups so managers can edit / view them from the API.
        for m in created:
            home_players = list(players_by_team_id[m.home_team_id])
            away_players = list(players_by_team_id[m.away_team_id])
            submit_lineup(
                match=m, team=m.home_team,
                starters=[home_players[i] for i in STARTER_INDICES],
                bench=[home_players[i] for i in BENCH_INDICES],
            )
            submit_lineup(
                match=m, team=m.away_team,
                starters=[away_players[i] for i in STARTER_INDICES],
                bench=[away_players[i] for i in BENCH_INDICES],
            )

        return created

    # ------------------------------------------------------------------
    # Demo transfer
    # ------------------------------------------------------------------
    def _make_demo_transfer(self, *, fantasy_team, stage,
                            own_players, replacement_players):
        # Swap the bench ATT (index 14) of the same position from a
        # different team. Preserves composition and stays within budget.
        player_out = own_players[14]
        player_in = replacement_players[14]
        make_transfer(
            fantasy_team=fantasy_team,
            stage=stage,
            player_out=player_out,
            player_in=player_in,
        )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    def _print_summary(self):
        org = Organization.objects.get(slug=self.DEMO_ORG_SLUG)
        competition = Competition.objects.get(organization=org, slug="funaab-football-league-demo")
        season = Season.objects.get(competition=competition, slug="2026-season")

        teams = Team.objects.filter(organization=org)
        players = Player.objects.filter(team__organization=org)
        matches = Match.objects.filter(competition=competition)

        n_finished = matches.filter(status=Match.Status.FINISHED).count()
        n_live = matches.filter(status=Match.Status.LIVE).count()
        n_halftime = matches.filter(status=Match.Status.HALFTIME).count()
        n_scheduled = matches.filter(status=Match.Status.SCHEDULED).count()

        users = User.objects.filter(email__endswith=f"@{self.DEMO_EMAIL_DOMAIN}")
        fantasy_teams = FantasyTeam.objects.filter(season=season)
        squads = (
            FantasyPlayerSelection.objects
            .filter(fantasy_team__season=season)
            .values("fantasy_team_id", "stage_id")
            .distinct()
            .count()
        )
        transfers = FantasyTransfer.objects.filter(fantasy_team__season=season).count()
        chip_uses = FantasyChipUse.objects.filter(season=season).count()
        fp = FantasyPoints.objects.filter(match__competition=competition).count()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Athlon demo seed complete."))
        self.stdout.write("")
        self.stdout.write(f"Organization: {org.name}")
        self.stdout.write(f"Competition: {competition.name}")
        self.stdout.write(f"Season: {season.name}")
        self.stdout.write("")
        self.stdout.write(f"Teams: {teams.count()}")
        self.stdout.write(f"Players: {players.count()}")
        self.stdout.write(f"Matches: {matches.count()}")
        self.stdout.write(f"Finished: {n_finished}")
        self.stdout.write(f"Live: {n_live}")
        self.stdout.write(f"Halftime: {n_halftime}")
        self.stdout.write(f"Scheduled: {n_scheduled}")
        self.stdout.write("")
        self.stdout.write(f"Users: {users.count()}")
        self.stdout.write(f"Fantasy teams: {fantasy_teams.count()}")
        self.stdout.write(f"Starting squads: {squads}")
        self.stdout.write(f"Transfers: {transfers}")
        self.stdout.write(f"Chip uses: {chip_uses}")
        self.stdout.write(f"Fantasy points: {fp}")
        self.stdout.write("")
        self.stdout.write("Demo credentials:")
        self.stdout.write(f"  admin : admin@{self.DEMO_EMAIL_DOMAIN} / {self.DEMO_PASSWORD}")
        self.stdout.write(f"  scout : scout@{self.DEMO_EMAIL_DOMAIN} / {self.DEMO_PASSWORD}")
        for i in range(1, 6):
            self.stdout.write(
                f"  user{i} : user{i}@{self.DEMO_EMAIL_DOMAIN} / {self.DEMO_PASSWORD}"
            )