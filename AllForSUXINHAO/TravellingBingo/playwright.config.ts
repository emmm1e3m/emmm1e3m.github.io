import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '../../test-results/travelling-bingo',
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/AllForSUXINHAO/TravellingBingo/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    cwd: '../..',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
