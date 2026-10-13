import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsBase } from '../lib/api';
import { WS_PATHS } from '../lib/apiPaths';
import type { WsMatchMessage } from '../lib/types';

export type WsStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';

type UseMatchWebSocketReturn = {
  wsStatus: WsStatus;
};

const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2000;

export function useMatchWebSocket(
  matchId: number | null,
  enabled = true,
  onEvent?: (msg: WsMatchMessage) => void,
): UseMatchWebSocketReturn {
  const [wsStatus, setWsStatus] = useState<WsStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const handleMessage = useCallback((msg: WsMatchMessage) => {
    onEventRef.current?.(msg);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (!matchId || !enabled) {
      setWsStatus(matchId ? 'closed' : 'idle');
      return;
    }

    let active = true;

    function connect() {
      if (!active || unmountedRef.current) return;

      const url = `${getWsBase()}${WS_PATHS.match(matchId!)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setWsStatus(retryRef.current > 0 ? 'reconnecting' : 'connecting');

      ws.onopen = () => {
        if (!active || unmountedRef.current) { ws.close(); return; }
        setWsStatus('connected');
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: unknown = JSON.parse(event.data as string);
          if (msg && typeof msg === 'object' && 'type' in msg) {
            const type = (msg as { type?: unknown }).type;
            if (type === 'match_state' || type === 'match_event') {
              handleMessage({ type });
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        if (active && !unmountedRef.current) setWsStatus('error');
      };

      ws.onclose = () => {
        if (!active || unmountedRef.current) return;
        const attempts = retryRef.current;
        if (attempts < MAX_RETRIES) {
          retryRef.current += 1;
          const delay = RETRY_BASE_MS * Math.pow(2, attempts);
          setWsStatus('reconnecting');
          retryTimerRef.current = setTimeout(connect, delay);
        } else {
          setWsStatus('closed');
        }
      };
    }

    connect();

    return () => {
      active = false;
      unmountedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setWsStatus('closed');
    };
  }, [matchId, enabled, handleMessage]);

  return { wsStatus };
}
