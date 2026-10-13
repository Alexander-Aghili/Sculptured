import { defineConfig, devices } from '@playwright/test';

/** RIG_E2E_PORT runs the server elsewhere than 14410 (crates/e2e-server reads it too). */
const port = process.env.RIG_E2E_PORT ?? '14410';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // crates/e2e-server: builds the UI, runs the real binary ($SCULPTURED_BIN, else a cargo build)
    // on a throwaway data dir and HOME, and cleans up serve, hostd and the directory.
    command: 'cargo run -q -p e2e-server',
    url: `http://127.0.0.1:${port}/api/rigs`,
    timeout: 600_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    // hostd outlives serve, so the launcher must get to run its cleanup (default is SIGKILL).
    gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
  },
});
