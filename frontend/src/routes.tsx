import { createBrowserRouter } from 'react-router';

import Layout from './components/Layout';
import AuthLayout from './components/AuthLayout';
import ProtectedRoute from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import FixturesPage from './pages/FixturesPage';
import MatchDetailsPage from './pages/MatchDetailsPage';
import TeamsPage from './pages/TeamsPage';
import TeamDetailPage from './pages/TeamDetailPage';
import PlayersPage from './pages/PlayersPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import StandingsPage from './pages/StandingsPage';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';

import FantasyPage from './pages/fantasy/FantasyPage';
import FantasyTeamPage from './pages/fantasy/FantasyTeamPage';
import FantasyProfilePage from './pages/fantasy/FantasyProfilePage';
import LeaderboardPage from './pages/fantasy/LeaderboardPage';
import GroupsPage from './pages/fantasy/GroupsPage';
import GroupDetailPage from './pages/fantasy/GroupDetailPage';

import ScoutDashboard from './pages/scout/ScoutDashboard';
import ScoutMatchesPage from './pages/scout/ScoutMatchesPage';
import ScoutMatchDetailPage from './pages/scout/ScoutMatchDetailPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import OrganizationsPage from './pages/admin/OrganizationsPage';
import CompetitionsPage from './pages/admin/CompetitionsPage';
import SeasonsPage from './pages/admin/SeasonsPage';
import StagesPage from './pages/admin/StagesPage';
import TeamsAdminPage from './pages/admin/TeamsAdminPage';
import PlayersAdminPage from './pages/admin/PlayersAdminPage';
import MatchesAdminPage from './pages/admin/MatchesAdminPage';
import ScoutsPage from './pages/admin/ScoutsPage';

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <p
        className="font-condensed font-black leading-none mb-4 select-none"
        style={{ fontSize: 'clamp(80px, 18vw, 140px)', color: '#1E2029' }}
      >
        404
      </p>
      <h1 className="font-condensed font-black text-[22px] text-text-1 tracking-tight mb-2">
        Page not found
      </h1>
      <p className="text-[13px] text-text-3 max-w-[280px] leading-relaxed mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-1.5 px-5 py-2.5 font-condensed font-bold text-[13px] tracking-[0.08em] hover:opacity-90 transition-opacity"
        style={{ background: '#22C55E', color: '#0A0F0C', borderRadius: 5 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M8 2L4 6l4 4" />
        </svg>
        Go home
      </a>
    </div>
  );
}

export const router = createBrowserRouter([
  // ── Main app layout (Nav + bottom nav) ──────────────────
  {
    element: <Layout />,
    children: [
      // Public
      { path: '/',                  element: <HomePage /> },
      { path: '/fixtures',          element: <FixturesPage /> },
      { path: '/matches/:matchId',  element: <MatchDetailsPage /> },
      { path: '/teams',             element: <TeamsPage /> },
      { path: '/teams/:teamId',     element: <TeamDetailPage /> },
      { path: '/players',           element: <PlayersPage /> },
      { path: '/players/:playerId', element: <PlayerDetailPage /> },
      { path: '/standings',         element: <StandingsPage /> },

      // Fantasy — public landing
      { path: '/app/fantasy', element: <FantasyPage /> },

      // Fantasy — authenticated
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/app/fantasy/team',              element: <FantasyTeamPage /> },
          { path: '/app/fantasy/leaderboard',       element: <LeaderboardPage /> },
          { path: '/app/fantasy/profile',           element: <FantasyProfilePage /> },
          { path: '/app/fantasy/groups',            element: <GroupsPage /> },
          { path: '/app/fantasy/groups/:groupId',   element: <GroupDetailPage /> },
        ],
      },

      // Scout — SCOUT or ADMIN role
      {
        element: <ProtectedRoute requiredRole="SCOUT" />,
        children: [
          { path: '/scout',                         element: <ScoutDashboard /> },
          { path: '/scout/matches',                 element: <ScoutMatchesPage /> },
          { path: '/scout/matches/:matchId',        element: <ScoutMatchDetailPage /> },
        ],
      },

      // Admin — ADMIN role only
      {
        element: <ProtectedRoute requiredRole="ADMIN" />,
        children: [
          { path: '/admin',                         element: <AdminDashboard /> },
          { path: '/admin/organizations',           element: <OrganizationsPage /> },
          { path: '/admin/competitions',            element: <CompetitionsPage /> },
          { path: '/admin/seasons',                 element: <SeasonsPage /> },
          { path: '/admin/stages',                  element: <StagesPage /> },
          { path: '/admin/teams',                   element: <TeamsAdminPage /> },
          { path: '/admin/players',                 element: <PlayersAdminPage /> },
          { path: '/admin/matches',                 element: <MatchesAdminPage /> },
          { path: '/admin/scouts',                  element: <ScoutsPage /> },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },

  // ── Auth layout (no main nav, no bottom nav) ─────────────
  {
    element: <AuthLayout />,
    children: [
      { path: '/auth/login',              element: <LoginPage /> },
      { path: '/auth/register',           element: <RegisterPage /> },
      { path: '/auth/forgot-password',    element: <ForgotPasswordPage /> },
      { path: '/auth/reset-password',     element: <ResetPasswordPage /> },
      { path: '/auth/verify-email/:token', element: <VerifyEmailPage /> },
      { path: '/auth/verify-email',        element: <VerifyEmailPage /> },  // token-less fallback (check inbox state)
    ],
  },
]);
