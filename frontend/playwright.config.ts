import { defineConfig } from "@playwright/test";

// Smoke tests run against mock mode, so no backend is needed. Uses the installed Chrome.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec vite build --mode mock --outDir dist-mock && pnpm exec vite preview --outDir dist-mock --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
