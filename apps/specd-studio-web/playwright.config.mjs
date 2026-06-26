import { defineConfig, devices } from '@playwright/test'

const baseURL =
  process.env.STUDIO_E2E_UI_BASE_URL ?? 'http://localhost:5174'

/**
 * E2E expects ui serve already running (see tests/e2e/README.md).
 * Do NOT use Playwright webServer — it often sits silent until timeout.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  globalTimeout: 120_000,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 12_000,
        navigationTimeout: 25_000,
        launchOptions: {
          timeout: 25_000,
          args: ['--disable-dev-shm-usage', '--no-sandbox'],
        },
        ...(process.env.PW_CHROMIUM_CHANNEL
          ? { channel: process.env.PW_CHROMIUM_CHANNEL }
          : {}),
      },
    },
  ],
})
