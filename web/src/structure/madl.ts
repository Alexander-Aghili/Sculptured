/** A MADL (Multi-Agent Descriptor Language) document: YAML whose top level has `madl:`, or JSON with a `"madl"` key. */
export function isMadl(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return /^madl\s*:/m.test(t);
  try {
    const v: unknown = JSON.parse(t);
    return typeof v === 'object' && v !== null && 'madl' in v;
  } catch {
    return false;
  }
}
