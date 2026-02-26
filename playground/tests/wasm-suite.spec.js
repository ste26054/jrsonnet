// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Evaluate a Jsonnet snippet through the WASM module in the browser. */
async function evaluateInWasm(page, { code, filename, files = [], extVars = [], extCodes = [] }) {
  return page.evaluate(
    ([code, filename, files, extVars, extCodes]) => {
      const vm = new window.Jrsonnet();
      try {
        for (const [p, c] of files) vm.add_file(p, c);
        for (const [k, v] of extVars) vm.ext_var(k, v);
        for (const [k, c] of extCodes) vm.ext_code(k, c);
        return { ok: vm.evaluate_snippet(filename, code) };
      } catch (e) {
        return { error: typeof e === "string" ? e : String(e) };
      } finally {
        vm.gc_collect();
        vm.free();
      }
    },
    [code, filename, files, extVars, extCodes],
  );
}

/**
 * Parse an insta snapshot file, returning the body after the YAML front matter.
 *
 * Format:
 * ```
 * ---
 * source: ...
 * expression: ...
 * input_file: ...
 * ---
 * <actual content>
 * ```
 */
function parseInstaSnapshot(content) {
  const parts = content.split("---\n");
  // parts[0] is empty (before first ---), parts[1] is YAML, parts[2+] is body
  return parts.slice(2).join("---\n").trimEnd();
}

/** Try to parse a string as JSON. Returns the parsed value or null. */
function tryParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suite tests use `test.assertThrow` or `test.paramNames` — custom Rust-only
// builtins not available in WASM.
// ---------------------------------------------------------------------------
const SKIP_SUITE = new Set([
  "function_lazy_args.jsonnet",
  "object_assertion.jsonnet",
  "std_param_names.jsonnet",
]);

// Golden tests that use custom builtins.
const SKIP_GOLDEN = new Set(["test_assertThrow.jsonnet"]);

// Tests that import themselves — need to be registered as virtual files.
const SELF_IMPORTING = new Set(["issue23.jsonnet"]);

// ---------------------------------------------------------------------------
// Test setup — shared page with WASM loaded once
// ---------------------------------------------------------------------------

test.describe("WASM test suite", () => {
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/playground/tests/wasm-harness.html");
    await page.waitForFunction(() => window.wasmReady === true, null, {
      timeout: 30_000,
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  // -------------------------------------------------------------------------
  // Suite tests: each file should evaluate to boolean `true`
  // -------------------------------------------------------------------------
  test.describe("suite", () => {
    const suiteDir = path.join(ROOT, "tests/suite");
    const files = fs
      .readdirSync(suiteDir)
      .filter((f) => f.endsWith(".jsonnet"))
      .sort();

    for (const file of files) {
      if (SKIP_SUITE.has(file)) continue;

      test(`suite/${file}`, async () => {
        const code = fs.readFileSync(path.join(suiteDir, file), "utf-8");
        const result = await evaluateInWasm(page, { code, filename: file });

        expect(result.error).toBeUndefined();
        expect(result.ok).toBe("true");
      });
    }
  });

  // -------------------------------------------------------------------------
  // Golden tests: compare output against insta snapshots
  // -------------------------------------------------------------------------
  test.describe("golden", () => {
    const goldenDir = path.join(ROOT, "tests/golden");
    const snapDir = path.join(ROOT, "tests/tests/snapshots");
    const files = fs
      .readdirSync(goldenDir)
      .filter((f) => f.endsWith(".jsonnet"))
      .sort();

    for (const file of files) {
      if (SKIP_GOLDEN.has(file)) continue;

      test(`golden/${file}`, async () => {
        const code = fs.readFileSync(path.join(goldenDir, file), "utf-8");

        // Build virtual files for self-importing tests.
        const virtualFiles = [];
        if (SELF_IMPORTING.has(file)) {
          virtualFiles.push([file, code]);
        }

        const result = await evaluateInWasm(page, {
          code,
          filename: file,
          files: virtualFiles,
        });

        // Load expected output from insta snapshot.
        const snapFile = `golden__golden@${file}.snap`;
        const snapPath = path.join(snapDir, snapFile);
        const snapContent = fs.readFileSync(snapPath, "utf-8");
        const expected = parseInstaSnapshot(snapContent);

        const expectedJson = tryParseJson(expected);

        if (expectedJson === null) {
          // Snapshot is not valid JSON — this is an error test.
          expect(result.error).toBeDefined();

          // Compare the first line (core error message); trace formatting
          // differs between WASM (format!("{e}")) and native (CompactFormat).
          const actualFirstLine = result.error.split("\n")[0];
          const expectedFirstLine = expected.split("\n")[0];
          expect(actualFirstLine).toBe(expectedFirstLine);
        } else {
          // Snapshot is valid JSON — compare structurally.
          expect(result.error).toBeUndefined();

          const actualJson = tryParseJson(result.ok);
          expect(actualJson).not.toBeNull();
          expect(actualJson).toEqual(expectedJson);
        }
      });
    }
  });
});
