import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const chrome =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((path) => existsSync(path));
const brave =
  process.env.BRAVE_PATH ||
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const browserProjects = [
  {
    name: "chrome",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: chrome ? { executablePath: chrome } : {},
    },
  },
];
if (existsSync(brave)) {
  browserProjects.push({
    name: "brave",
    use: {
      ...devices["Desktop Chrome"],
      launchOptions: { executablePath: brave },
    },
  });
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: browserProjects,
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
