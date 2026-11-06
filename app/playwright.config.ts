import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4301', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  // Built with NO database (see .env.e2e), so the tests never touch real data and the app runs in its offline mode.
  webServer: {
    command: 'npx tsc --noEmit && npx vite build --mode e2e && npx vite preview --port 4301 --strictPort',
    url: 'http://localhost:4301',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
