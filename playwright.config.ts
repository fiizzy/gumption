import { defineConfig } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const VIEWPORT = { width: 1600, height: 1000 };

// Runs against the Next dev server in the locally installed Chrome (no
// browser download). Tauri IPC is stubbed per test (see e2e/fixtures.ts), so
// these cover the canvas itself; the desktop shell is exercised manually.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    viewport: VIEWPORT,
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
