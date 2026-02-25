const { test, expect } = require("@playwright/test");

test.describe("Playground loads", () => {
  test("page title and header", async ({ page }) => {
    await page.goto("/playground/index.html");
    await expect(page).toHaveTitle("jrsonnet Playground");
    await expect(page.locator("header h1")).toHaveText("jrsonnet");
  });

  test("WASM initializes and shows Ready status", async ({ page }) => {
    await page.goto("/playground/index.html");
    const status = page.locator("#status");
    // Wait for WASM to load (up to 30s)
    await expect(status).toHaveText("Ready", { timeout: 30_000 });
    await expect(status).toHaveClass(/ready/);
    // Run button should be enabled
    await expect(page.locator("#run-btn")).toBeEnabled();
  });

  test("version label is populated", async ({ page }) => {
    await page.goto("/playground/index.html");
    const version = page.locator("#version-label");
    await expect(version).not.toHaveText("loading...", { timeout: 30_000 });
    // Should match semver pattern like v0.5.0-pre97
    await expect(version).toHaveText(/^v\d+\.\d+\.\d+/);
  });
});

test.describe("Evaluation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground/index.html");
    // Wait for WASM to be ready
    await expect(page.locator("#status")).toHaveText("Ready", {
      timeout: 30_000,
    });
  });

  test("evaluate hello world example (default)", async ({ page }) => {
    // The default example is "hello" which is loaded on page init
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    // Should contain JSON with greeting, target, message fields
    const text = await output.textContent();
    expect(text).toContain('"greeting"');
    expect(text).toContain('"Hello"');
    expect(text).toContain('"message"');
    expect(text).toContain("Hello, world!");
  });

  // Note: Ctrl+Enter keyboard shortcut cannot be tested in headless Chromium
  // because CodeMirror uses its own input handling that doesn't respond to
  // synthetic keyboard events. The shortcut works in real browsers.

  test("timing is displayed after evaluation", async ({ page }) => {
    await page.click("#run-btn");
    const timing = page.locator("#timing");
    await expect(timing).toHaveText(/\d+\.\d+ms/);
  });

  test("standard library functions work", async ({ page }) => {
    // Select the stdlib example
    await page.selectOption("#examples", "stdlib");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    // Check various stdlib results
    expect(text).toContain('"HELLO"'); // std.asciiUpper
    expect(text).toContain("1024"); // std.pow(2, 10)
    expect(text).toContain("12"); // std.sqrt(144)
  });

  test("functions example works", async ({ page }) => {
    await page.selectOption("#examples", "functions");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"fib_10"');
    expect(text).toContain("55"); // fibonacci(10) = 55
  });

  test("object composition example works", async ({ page }) => {
    await page.selectOption("#examples", "objects");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"Alice"');
    expect(text).toContain('"Bob"');
  });

  test("imports example works", async ({ page }) => {
    await page.selectOption("#examples", "imports");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"admins"');
    expect(text).toContain('"user_names"');
  });

  test("simple import example", async ({ page }) => {
    await page.selectOption("#examples", "simpleImport");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain("Hello, Alice!");
    expect(text).toContain("Goodbye, Bob!");
  });

  test("transitive import example (fancy_greeter → greeter)", async ({ page }) => {
    await page.selectOption("#examples", "transitiveImport");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain("Hello, World!");
    expect(text).toContain("Hello, Alice!");
    expect(text).toContain("Goodbye, Alice!");
  });

  test("kubernetes example imports libsonnet and evaluates", async ({ page }) => {
    await page.selectOption("#examples", "kubernetes");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"web-app"');
    expect(text).toContain('"api-server"');
    expect(text).toContain('"Deployment"');
    expect(text).toContain('"Service"');
    expect(text).toContain("nginx:1.25-alpine");
  });

  test("config management example imports multiple libs", async ({ page }) => {
    await page.selectOption("#examples", "configMgmt");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"environments"');
    expect(text).toContain('"production_custom"');
    expect(text).toContain('"dev"');
    expect(text).toContain('"staging"');
  });

  test("utilities example imports utils.libsonnet", async ({ page }) => {
    await page.selectOption("#examples", "utilities");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    expect(text).toContain('"userLookup"');
    expect(text).toContain('"greeting"');
    expect(text).toContain('"cleaned"');
    expect(text).toContain("Hello Alice");
  });

  test("monitoring stack example uses transitive imports (monitoring → kubernetes)", async ({ page }) => {
    await page.selectOption("#examples", "monitoringStack");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/success/);
    const text = await output.textContent();
    // Verify monitoring-level fields
    expect(text).toContain('"stack"');
    expect(text).toContain('"extra_grafana"');
    expect(text).toContain('"prometheus"');
    expect(text).toContain('"grafana"');
    // Verify kubernetes-level fields came through transitively
    expect(text).toContain('"Deployment"');
    expect(text).toContain('"Service"');
    expect(text).toContain("prom/prometheus");
    expect(text).toContain("grafana/grafana");
    expect(text).toContain('"observability"');
  });
});

test.describe("Error handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground/index.html");
    await expect(page.locator("#status")).toHaveText("Ready", {
      timeout: 30_000,
    });
  });

  test("syntax error is displayed", async ({ page }) => {
    // Clear editor and type invalid Jsonnet
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("{ a: }");
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/error/);
  });

  test("runtime error is displayed", async ({ page }) => {
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type('error "boom"');
    await page.click("#run-btn");

    const output = page.locator("#output");
    await expect(output).toHaveClass(/error/);
    const text = await output.textContent();
    expect(text).toContain("boom");
  });
});

test.describe("UI interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground/index.html");
    await expect(page.locator("#status")).toHaveText("Ready", {
      timeout: 30_000,
    });
  });

  test("example selector changes editor content", async ({ page }) => {
    await page.selectOption("#examples", "functions");
    // After selecting, the selector resets to empty
    await expect(page.locator("#examples")).toHaveValue("");
    // Editor should contain fibonacci
    const editorText = await page
      .locator(".cm-content")
      .textContent();
    expect(editorText).toContain("fibonacci");
  });

  test("example selector resets after selection", async ({ page }) => {
    await page.selectOption("#examples", "objects");
    await expect(page.locator("#examples")).toHaveValue("");
  });
});
