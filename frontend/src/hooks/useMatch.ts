import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { Match, MatchEvent } from '../lib/types';

type UseMatchReturn = {
  match: Match | null;
  events: MatchEvent[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useMatch(matchId: number | null): UseMatchReturn {
  const [match, setMatch]   = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!matchId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Events endpoint returns a plain array (not paginated)
      const [matchData, eventsData] = await Promise.all([
        api.get<Match>(API_PATHS.matches.detail(matchId)),
        api.get<MatchEvent[]>(API_PATHS.matches.events(matchId)),
      ]);
      setMatch(matchData);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load match');
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { match, events, isLoading, error, refetch: fetch };
}
