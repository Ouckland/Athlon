from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Competition, Organization, Player, Team, Season, Stage
from .services import LeagueError, set_team_captain, set_team_competitions

User = get_user_model()


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------
class OrganizationModelTests(TestCase):
    def test_creation_with_slug(self):
        org = Organization.objects.create(name="FUNAAB Sports", slug="funaab-sports")
        self.assertEqual(org.slug, "funaab-sports")
        self.assertEqual(str(org), "FUNAAB Sports")

    def test_slug_must_be_unique(self):
        Organization.objects.create(name="A", slug="dup")
        with self.assertRaises(IntegrityError):
            Organization.objects.create(name="B", slug="dup")

    def test_name_is_required(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Organization.objects.create(name=None, slug="x")


# ---------------------------------------------------------------------------
# Competition
# ---------------------------------------------------------------------------
class CompetitionModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")

    def test_belongs_to_organization(self):
        comp = Competition.objects.create(
            organization=self.org, name="2026 Campus League", slug="2026-cl"
        )
        self.assertEqual(comp.organization, self.org)
        self.assertEqual(self.org.competitions.count(), 1)

    def test_default_status_is_draft(self):
        comp = Competition.objects.create(
            organization=self.org, name="X", slug="x"
        )
        self.assertEqual(comp.status, Competition.Status.DRAFT)

    def test_slug_unique_per_org(self):
        Competition.objects.create(organization=self.org, name="X", slug="cups")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Competition.objects.create(organization=self.org, name="Y", slug="cups")

    def test_same_slug_allowed_in_different_orgs(self):
        org2 = Organization.objects.create(name="Org2", slug="org2")
        Competition.objects.create(organization=self.org, name="X", slug="cups")
        Competition.objects.create(organization=org2, name="Y", slug="cups")
        self.assertEqual(Competition.objects.filter(slug="cups").count(), 2)


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------
class TeamModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")

    def test_belongs_to_organization(self):
        team = Team.objects.create(organization=self.org, name="CS FC", slug="cs-fc")
        self.assertEqual(team.organization, self.org)

    def test_competition_m2m(self):
        team = Team.objects.create(organization=self.org, name="CS FC", slug="cs-fc")
        comp = Competition.objects.create(
            organization=self.org, name="League", slug="league"
        )
        team.competitions.add(comp)
        self.assertIn(comp, team.competitions.all())
        self.assertIn(team, comp.teams.all())

    def test_slug_unique_per_org(self):
        Team.objects.create(organization=self.org, name="A", slug="t")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Team.objects.create(organization=self.org, name="B", slug="t")


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------
class PlayerModelTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")
        self.team = Team.objects.create(organization=self.org, name="T", slug="t")

    def test_optional_user(self):
        p = Player.objects.create(
            team=self.team, first_name="John", position=Player.Position.ATT
        )
        self.assertIsNone(p.user)

    def test_position_choices(self):
        p = Player.objects.create(
            team=self.team, first_name="A", position=Player.Position.GK
        )
        self.assertEqual(p.position, "GK")

    def test_str_uses_display_name(self):
        p = Player.objects.create(
            team=self.team,
            first_name="John",
            last_name="Doe",
            display_name="JD",
            position=Player.Position.MID,
        )
        self.assertEqual(str(p), "JD")

    def test_shirt_number_unique_per_team(self):
        Player.objects.create(
            team=self.team, first_name="A", position=Player.Position.GK, shirt_number=9
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Player.objects.create(
                    team=self.team,
                    first_name="B",
                    position=Player.Position.DEF,
                    shirt_number=9,
                )

    def test_same_shirt_number_allowed_on_different_teams(self):
        other_team = Team.objects.create(organization=self.org, name="T2", slug="t2")
        Player.objects.create(
            team=self.team, first_name="A", position=Player.Position.GK, shirt_number=9
        )
        Player.objects.create(
            team=other_team, first_name="B", position=Player.Position.DEF, shirt_number=9
        )

    def test_link_player_to_user(self):
        user = User.objects.create_user(email="p@example.com", password="StrongPass!23")
        p = Player.objects.create(
            team=self.team,
            user=user,
            first_name="John",
            position=Player.Position.ATT,
        )
        self.assertEqual(p.user, user)


# ---------------------------------------------------------------------------
# Captain
# ---------------------------------------------------------------------------
class CaptainTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", slug="org")
        self.team = Team.objects.create(organization=self.org, name="T", slug="t")
        self.other_team = Team.objects.create(organization=self.org, name="T2", slug="t2")

    def test_captain_must_belong_to_team(self):
        foreign_player = Player.objects.create(
            team=self.other_team, first_name="X", position=Player.Position.GK
        )
        with self.assertRaises(LeagueError):
            set_team_captain(team=self.team, player=foreign_player)

    def test_set_and_clear_captain(self):
        p = Player.objects.create(
            team=self.team, first_name="A", position=Player.Position.MID
        )
        set_team_captain(team=self.team, player=p)
        self.team.refresh_from_db()
        self.assertEqual(self.team.captain, p)
        set_team_captain(team=self.team, player=None)
        self.team.refresh_from_db()
        self.assertIsNone(self.team.captain)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
class LeagueAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="api@example.com", password="StrongPass!23"
        )

    def test_create_organization_requires_auth(self):
        resp = self.client.post(
            reverse("league:organization-list"), {"name": "Org"}, format="json"
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_create_organization_authenticated(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("league:organization-list"),
            {"name": "FUNAAB Sports"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "funaab-sports")

    def test_list_organizations_public(self):
        Organization.objects.create(name="A", slug="a")
        resp = self.client.get(reverse("league:organization-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_create_competition(self):
        org = Organization.objects.create(name="A", slug="a")
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("league:competition-list"),
            {"organization_id": org.id, "name": "2026 League", "season": "2026"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["organization"]["id"], org.id)

    def test_create_team_with_competition(self):
        org = Organization.objects.create(name="A", slug="a")
        comp = Competition.objects.create(organization=org, name="C", slug="c")
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("league:team-list"),
            {
                "organization_id": org.id,
                "name": "CS FC",
                "short_name": "CSFC",
                "competition_ids": [comp.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["competitions"]), 1)

    def test_create_player(self):
        org = Organization.objects.create(name="A", slug="a")
        team = Team.objects.create(organization=org, name="T", slug="t")
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("league:player-list"),
            {
                "team_id": team.id,
                "first_name": "John",
                "last_name": "Doe",
                "shirt_number": 9,
                "position": "ATT",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["position"], "ATT")
        self.assertNotIn("password", resp.data)

    def test_player_response_does_not_leak_password(self):
        org = Organization.objects.create(name="A", slug="a")
        team = Team.objects.create(organization=org, name="T", slug="t")
        Player.objects.create(team=team, first_name="X", position=Player.Position.GK)
        resp = self.client.get(reverse("league:player-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("password", str(resp.data))

# ---------------------------------------------------------------------------
# Fix 1: captain serialization uses CaptainBriefSerializer
# ---------------------------------------------------------------------------
class TeamCaptainSerializationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="cap@example.com", password="StrongPass!23"
        )
        self.org = Organization.objects.create(name="Org", slug="org")
        self.team = Team.objects.create(organization=self.org, name="T", slug="t")
        self.captain = Player.objects.create(
            team=self.team,
            first_name="Ada",
            last_name="Obi",
            position=Player.Position.MID,
        )
        set_team_captain(team=self.team, player=self.captain)

    def test_team_detail_returns_captain_as_player_shape(self):
        resp = self.client.get(reverse("league:team-detail", args=[self.team.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["captain"])
        # Player-shaped: id + display_name. NOT team-shaped.
        self.assertIn("id", resp.data["captain"])
        self.assertIn("display_name", resp.data["captain"])
        self.assertNotIn("short_name", resp.data["captain"])
        self.assertNotIn("slug", resp.data["captain"])
        self.assertEqual(resp.data["captain"]["id"], self.captain.id)

    def test_team_list_returns_captain_as_player_shape(self):
        resp = self.client.get(reverse("league:team-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["captain"]["id"], self.captain.id)
        self.assertNotIn("short_name", resp.data[0]["captain"])


# ---------------------------------------------------------------------------
# Fix 2: competitions must match the team's organization
# ---------------------------------------------------------------------------
class TeamCompetitionOrganizationMatchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="tm@example.com", password="StrongPass!23"
        )
        self.client.force_authenticate(user=self.user)

        self.org_a = Organization.objects.create(name="Org A", slug="org-a")
        self.org_b = Organization.objects.create(name="Org B", slug="org-b")
        self.comp_a = Competition.objects.create(
            organization=self.org_a, name="A Cup", slug="a-cup"
        )
        self.comp_b = Competition.objects.create(
            organization=self.org_b, name="B Cup", slug="b-cup"
        )

    # -- serializer layer -------------------------------------------------
    def test_api_rejects_mismatched_competition(self):
        resp = self.client.post(
            reverse("league:team-list"),
            {
                "organization_id": self.org_a.id,
                "name": "CS FC",
                "competition_ids": [self.comp_b.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("competition_ids", resp.data)
        self.assertFalse(Team.objects.filter(slug="cs-fc").exists())

    def test_api_rejects_partially_mismatched_competitions(self):
        resp = self.client.post(
            reverse("league:team-list"),
            {
                "organization_id": self.org_a.id,
                "name": "Mixed FC",
                "competition_ids": [self.comp_a.id, self.comp_b.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("competition_ids", resp.data)
        self.assertFalse(Team.objects.filter(slug="mixed-fc").exists())

    def test_api_accepts_matching_competitions(self):
        resp = self.client.post(
            reverse("league:team-list"),
            {
                "organization_id": self.org_a.id,
                "name": "Good FC",
                "competition_ids": [self.comp_a.id],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["competitions"]), 1)
        self.assertEqual(resp.data["competitions"][0]["id"], self.comp_a.id)

    # -- service layer ----------------------------------------------------
    def test_service_rejects_mismatched_competition(self):
        team = Team.objects.create(
            organization=self.org_a, name="Svc FC", slug="svc-fc"
        )
        with self.assertRaises(LeagueError):
            set_team_competitions(team=team, competitions=[self.comp_b])
        self.assertEqual(team.competitions.count(), 0)

    def test_service_accepts_matching_competition(self):
        team = Team.objects.create(
            organization=self.org_a, name="Svc2 FC", slug="svc2-fc"
        )
        set_team_competitions(team=team, competitions=[self.comp_a])
        self.assertEqual(team.competitions.count(), 1)
        self.assertIn(self.comp_a, team.competitions.all())

    def test_service_accepts_empty_list(self):
        team = Team.objects.create(
            organization=self.org_a, name="Svc3 FC", slug="svc3-fc"
        )
        set_team_competitions(team=team, competitions=[])
        self.assertEqual(team.competitions.count(), 0)

class SeasonStageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="stages@example.com", password="StrongPass!23"
        )
        self.org = Organization.objects.create(name="Org", slug="org-ss")
        self.league = Competition.objects.create(
            organization=self.org, name="League", slug="league-ss",
            type=Competition.Type.LEAGUE,
        )
        self.cup = Competition.objects.create(
            organization=self.org, name="Cup", slug="cup-ss",
            type=Competition.Type.CUP,
        )

    # -- competition type ------------------------------------------------
    def test_competition_defaults_to_league(self):
        c = Competition.objects.create(organization=self.org, name="X", slug="x-ss")
        self.assertEqual(c.type, Competition.Type.LEAGUE)

    def test_competition_api_exposes_type(self):
        resp = self.client.get(
            reverse("league:competition-detail", args=[self.league.id])
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["type"], "LEAGUE")

    # -- season ----------------------------------------------------------
    def test_create_season_requires_auth(self):
        resp = self.client.post(
            reverse("league:competition-seasons", args=[self.league.id]),
            {"name": "2026"}, format="json",
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_create_season_authenticated(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            reverse("league:competition-seasons", args=[self.league.id]),
            {"name": "2026"}, format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["name"], "2026")
        self.assertEqual(resp.data["competition"]["id"], self.league.id)
        self.assertTrue(
            Season.objects.filter(competition=self.league, name="2026").exists()
        )

    def test_season_slug_deduped_within_competition(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(
            reverse("league:competition-seasons", args=[self.league.id]),
            {"name": "2026"}, format="json",
        )
        resp = self.client.post(
            reverse("league:competition-seasons", args=[self.league.id]),
            {"name": "2026"}, format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertNotEqual(resp.data["slug"], "2026")

    def test_same_season_slug_across_competitions_ok(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(
            reverse("league:competition-seasons", args=[self.league.id]),
            {"name": "2026"}, format="json",
        )
        resp = self.client.post(
            reverse("league:competition-seasons", args=[self.cup.id]),
            {"name": "2026"}, format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "2026")

    def test_season_detail_is_public(self):
        s = Season.objects.create(
            competition=self.league, name="2026", slug="2026-pub"
        )
        resp = self.client.get(reverse("league:season-detail", args=[s.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], s.id)

    # -- stage -----------------------------------------------------------
    def test_league_accepts_gameweek(self):
        self.client.force_authenticate(user=self.user)
        s = Season.objects.create(
            competition=self.league, name="2026", slug="2026-gw"
        )
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "GAMEWEEK", "number": 1}, format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["kind"], "GAMEWEEK")
        self.assertEqual(resp.data["season"]["id"], s.id)

    def test_league_rejects_round(self):
        self.client.force_authenticate(user=self.user)
        s = Season.objects.create(
            competition=self.league, name="2026", slug="2026-r"
        )
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "ROUND", "number": 1}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cup_accepts_round(self):
        self.client.force_authenticate(user=self.user)
        s = Season.objects.create(
            competition=self.cup, name="2026", slug="2026-cup"
        )
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "ROUND", "number": 1}, format="json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_cup_rejects_gameweek(self):
        self.client.force_authenticate(user=self.user)
        s = Season.objects.create(
            competition=self.cup, name="2026", slug="2026-cup2"
        )
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "GAMEWEEK", "number": 1}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_stage_number_rejected(self):
        self.client.force_authenticate(user=self.user)
        s = Season.objects.create(
            competition=self.league, name="2026", slug="2026-dup"
        )
        Stage.objects.create(season=s, kind=Stage.Kind.GAMEWEEK, number=1)
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "GAMEWEEK", "number": 1}, format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("detail", resp.data)

    def test_stage_create_requires_auth(self):
        s = Season.objects.create(
            competition=self.league, name="2026", slug="2026-noauth"
        )
        resp = self.client.post(
            reverse("league:season-stages", args=[s.id]),
            {"kind": "GAMEWEEK", "number": 1}, format="json",
        )
        self.assertIn(resp.status_code, (401, 403))