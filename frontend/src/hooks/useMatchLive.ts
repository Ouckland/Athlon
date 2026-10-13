import { useCallback } from 'react';
import { useMatchWebSocket, type WsStatus } from './useWebSocket';
import type { WsMatchMessage } from '../lib/types';

type UseMatchLiveReturn = {
  wsStatus: WsStatus;
};

/**
 * Match-specific real-time hook. Wraps useMatchWebSocket and triggers
 * a REST refresh whenever the backend reports a match state or event change.
 * REST remains the source of truth for message payload details.
 */
export function useMatchLive(
  matchId: number | null,
  enabled = true,
  onEvent?: () => void,
): UseMatchLiveReturn {
  const handleWsEvent = useCallback(
    (_msg: WsMatchMessage) => { onEvent?.(); },
    [onEvent],
  );

  const { wsStatus } = useMatchWebSocket(matchId, enabled, handleWsEvent);
  return { wsStatus };
}
