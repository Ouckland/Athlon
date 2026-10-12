import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { Match, PaginatedResponse } from '../lib/types';

type UsePublicMatchesOptions = {
  status?: string;
  competition?: number;
};

type UsePublicMatchesReturn = {
  matches: Match[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export function usePublicMatches(options: UsePublicMatchesOptions = {}): UsePublicMatchesReturn {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | undefined> = {};
      if (options.status)      params.status      = options.status;
      if (options.competition) params.competition = options.competition;

      const res = await api.get<PaginatedResponse<Match>>(API_PATHS.public.matches, params);
      setMatches(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load matches');
    } finally {
      setIsLoading(false);
    }
  }, [options.status, options.competition]);

  useEffect(() => { fetch(); }, [fetch]);

  return { matches, isLoading, error, refetch: fetch };
}
