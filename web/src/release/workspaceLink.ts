/** Carry only a loopback origin, never a project path, credential, or arbitrary redirect. */
export function workspaceOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null;
  } catch { return null; }
}
export function rememberWorkspace(): string | null {
  const supplied = workspaceOrigin(new URLSearchParams(window.location.search).get('workspace'));
  try {
    if (supplied) sessionStorage.setItem('sculptured-workspace-origin', supplied);
    return supplied ?? workspaceOrigin(sessionStorage.getItem('sculptured-workspace-origin')) ?? workspaceOrigin(import.meta.env.VITE_WORKSPACE_URL ?? null);
  } catch { return supplied; }
}
export function communityLink(service: string, page: string): string {
  const url = new URL(`/community${page}`, service);
  const origin = workspaceOrigin(window.location.origin);
  if (origin) url.searchParams.set('workspace', origin);
  return url.toString();
}
