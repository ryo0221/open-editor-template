import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/shared',
  workers: 1,
  use: {
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--renderer-process-limit=2'],
    },
  },
});
