import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
    env: { ATLAS_DATA_DIR: '.test-data' }
  }
});
