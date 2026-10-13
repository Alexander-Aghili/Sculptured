/** Keep the captured prompt intact while presenting its work message separately. */
export function splitTeamMessage(raw: string): { text: string; briefing?: string } {
  const marker = '\n\n--- Current message ---\n';
  const at = raw.indexOf(marker);
  if (!raw.startsWith('Team architecture (operator configuration):') || at < 0) return { text: raw };
  return { briefing: raw.slice(0, at), text: raw.slice(at + marker.length) };
}
