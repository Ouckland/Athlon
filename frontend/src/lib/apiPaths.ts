// All Athlon API endpoint paths.
// Source of truth: Athlon API contract / Django backend.
// Do NOT add undocumented endpoints.

export const API_PATHS = {
  auth: {
    register:             '/api/accounts/register/',
    login:                '/api/accounts/login/',
    logout:               '/api/accounts/logout/',
    me:                   '/api/accounts/me/',
    forgotPassword:       '/api/accounts/forgot-password/',
    resetPassword:        '/api/accounts/reset-password/',
    resendVerification:   '/api/accounts/resend-verification/',
    verifyEmail: (token: string) => `/api/accounts/verify-email/${token}/`,
  },

  organizations: {
    list:   '/api/league/organizations/',
    detail: (id: number) => `/api/league/organizations/${id}/`,
  },

  competitions: {
    list:       '/api/league/competitions/',
    detail:     (id: number) => `/api/league/competitions/${id}/`,
    teams:      (id: number) => `/api/league/competitions/${id}/teams/`,
    teamRemove: (competitionId: number, teamId: number) => `/api/league/competitions/${competitionId}/teams/${teamId}/`,
  },

  seasons: {
    list:   (competitionId: number) => `/api/league/competitions/${competitionId}/seasons/`,
    detail: (id: number)            => `/api/league/seasons/${id}/`,
  },

  stages: {
    list:   (seasonId: number) => `/api/league/seasons/${seasonId}/stages/`,
    detail: (id: number)       => `/api/league/stages/${id}/`,
  },

  teams: {
    list:         '/api/league/teams/',
    detail:       (id: number)                   => `/api/league/teams/${id}/`,
    managers:     (teamId: number)               => `/api/league/teams/${teamId}/managers/`,
    managerItem:  (teamId: number, userId: number) => `/api/league/teams/${teamId}/managers/${userId}/`,
  },

  players: {
    list:   '/api/league/players/',
    detail: (id: number) => `/api/league/players/${id}/`,
  },

  matches: {
    list:    '/api/matches/',
    detail:  (id: number)               => `/api/matches/${id}/`,
    events:  (matchId: number)          => `/api/matches/${matchId}/events/`,
    lineups: (matchId: number, teamId: number) => `/api/matches/${matchId}/lineups/${teamId}/`,
  },

  public: {
    matches: '/api/public/matches/',
  },

  fantasy: {
    teams:        '/api/fantasy/teams/',
    teamDetail:   (id: number) => `/api/fantasy/teams/${id}/`,
    squad:        (teamId: number, stageId: number) => `/api/fantasy/teams/${teamId}/squads/${stageId}/`,
    leaderboard:  '/api/fantasy/leaderboard/',
    groups:            '/api/fantasy/groups/',
    groupDetail:       (id: number)                    => `/api/fantasy/groups/${id}/`,
    groupJoin:         '/api/fantasy/groups/join/',
    groupLeave:        (id: number)                    => `/api/fantasy/groups/${id}/leave/`,
    groupRemoveMember: (groupId: number, userId: number) => `/api/fantasy/groups/${groupId}/members/${userId}/remove/`,
    groupLeaderboard:  (id: number)                    => `/api/fantasy/groups/${id}/leaderboard/`,
  },
} as const;

// WebSocket paths
export const WS_PATHS = {
  match: (matchId: number) => `/ws/matches/${matchId}/`,
} as const;
