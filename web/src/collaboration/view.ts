import { useCallback, useSyncExternalStore } from 'react';
import type { ExchangeKind } from './exchanges';

type View = { open: boolean; agent: string; kind: ExchangeKind | '' };
// Per project, for this browser session. Returning from an agent restores the board companion.
const views = new Map<string, View>();
const empty: View = { open: false, agent: '', kind: '' };
const event = 'team-conversation-view';
export function useConversationView(team: string) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener(event, notify);
    return () => window.removeEventListener(event, notify);
  }, []);
  const view = useSyncExternalStore(subscribe, () => views.get(team) ?? empty);
  const change = (patch: Partial<View>) => {
    views.set(team, { ...views.get(team) ?? empty, ...patch });
    window.dispatchEvent(new Event(event));
  };
  return [view, change] as const;
}
