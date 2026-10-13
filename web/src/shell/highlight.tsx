import { createContext, useContext, type ReactNode } from 'react';

const Query = createContext('');

/** Search text for the subtree: every `Hl` inside marks its matches. */
export function Highlight({ query, children }: { query: string; children: ReactNode }) {
  return <Query.Provider value={query.trim().toLowerCase()}>{children}</Query.Provider>;
}

export function useQuery(): string {
  return useContext(Query);
}

/** Text with each case-insensitive match of the current query wrapped in `<mark class="hit">`. */
export function Hl({ text }: { text: string }) {
  const q = useContext(Query);
  if (!q || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, i + q.length)) {
    if (i > from) out.push(text.slice(from, i));
    out.push(
      <mark key={i} className="hit">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    from = i + q.length;
  }
  if (out.length === 0) return <>{text}</>;
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

/** Whether any of the texts contains the query (already lower-cased). */
export function matches(q: string, ...texts: (string | undefined | null)[]): boolean {
  if (!q) return false;
  return texts.some((t) => !!t && t.toLowerCase().includes(q));
}

/**
 * Scrolls `container` so `el` sits in its middle (or top), without scrolling any other
 * ancestor: `scrollIntoView` would also move the app's own frame.
 */
export function scrollWithin(container: HTMLElement | null, el: HTMLElement | null, block: 'center' | 'start' = 'center') {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const offset = r.top - c.top + container.scrollTop;
  container.scrollTop = block === 'center' ? offset - (container.clientHeight - r.height) / 2 : offset - 12;
}
