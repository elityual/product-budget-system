import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 8766);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: baseURL,
    reuseExistingServer: false,
    env: { ATLAS_DATA_DIR: '.test-data', PORT: String(port) }
  }
});
