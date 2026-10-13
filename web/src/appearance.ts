/** Local display preferences only; never sent to the server. */
export const APPEARANCE_KEY = 'sculptured.appearance.v1';
export const FONTS = {
  inter: { label: 'Inter', value: '"Inter", "Segoe UI", system-ui, sans-serif' },
  system: { label: 'System', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  plex: { label: 'IBM Plex Sans', value: '"IBM Plex Sans", system-ui, sans-serif' },
  humanist: { label: 'Humanist', value: '"Aptos", "Trebuchet MS", system-ui, sans-serif' },
} as const;
export type Appearance = { font: keyof typeof FONTS; size: number; glass: boolean };
export const DEFAULT_APPEARANCE: Appearance = { font: 'inter', size: 13, glass: true };

export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return { ...DEFAULT_APPEARANCE };
    return {
      font: Object.hasOwn(FONTS, value.font) ? value.font : DEFAULT_APPEARANCE.font,
      size: Number.isInteger(value.size) && value.size >= 12 && value.size <= 16 ? value.size : DEFAULT_APPEARANCE.size,
      glass: typeof value.glass === 'boolean' ? value.glass : DEFAULT_APPEARANCE.glass,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function applyAppearance(value: Appearance) {
  document.documentElement.style.setProperty('--font-ui', FONTS[value.font].value);
  document.documentElement.style.setProperty('--ui-size', `${value.size}px`);
  document.documentElement.dataset.surface = value.glass ? 'glass' : 'solid';
}

export function saveAppearance(value: Appearance) {
  applyAppearance(value);
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value)); } catch { /* Still works for this session. */ }
}
