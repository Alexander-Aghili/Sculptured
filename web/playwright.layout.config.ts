import { defineConfig, devices } from '@playwright/test';

/**
 * Layout-only e2e (`e2e/layout.spec.ts`): the built UI from `vite preview`, with every
 * `/api/*` call answered by Playwright route fixtures. No server, no cargo, no agents.
 * LAYOUT_DIST serves another build (for before/after screenshots).
 */
const port = process.env.RIG_LAYOUT_PORT ?? '14470';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'layout.spec.ts',
  timeout: 60_000,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort --outDir ${process.env.LAYOUT_DIST ?? 'dist'}`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
