const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
  },
  webServer: {
    command: "python3 -m http.server 8080",
    cwd: "..",
    port: 8080,
    reuseExistingServer: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
