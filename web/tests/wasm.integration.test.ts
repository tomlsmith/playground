// @vitest-environment node

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import init, {
  analyze_and_format_toml,
  analyze_toml,
  format_toml,
} from "../src/generated/tomlsmith_playground.js";

beforeAll(async () => {
  const bytes = readFileSync(
    new URL("../src/generated/tomlsmith_playground_bg.wasm", import.meta.url),
  );
  await init({ module_or_path: new Uint8Array(bytes) });
});

describe("generated TomlSmith WebAssembly module", () => {
  it("analyzes TOML 1.0 through the generated browser glue", () => {
    const result = analyze_toml("name = \"playground\"\n", "1.0");

    expect(result).toMatchObject({
      version: "1.0",
      valid: true,
      stats: { keys: 1, bytes: 20 },
    });
    expect(result.tokens).toContainEqual(
      expect.objectContaining({
        kind: "key",
        range: expect.objectContaining({
          start: 0,
          end: 4,
          line: 1,
          column: 1,
          end_column: 5,
        }),
      }),
    );
    for (const token of result.tokens) {
      expect(token).not.toHaveProperty("text");
    }
  });

  it("preserves structural highlight kinds from the published core crate", () => {
    const result = analyze_toml(
      '[workspace]\nmembers = ["core"]\nmetadata = { enabled = true }\n[[bin]]\n',
      "1.1",
    );

    expect(result.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "table" }),
        expect.objectContaining({ kind: "array-key" }),
        expect.objectContaining({ kind: "inline-table-key" }),
        expect.objectContaining({ kind: "array-table" }),
      ]),
    );
  });

  it("formats source through the generated browser glue", () => {
    expect(format_toml("answer=42\n", "1.1")).toMatchObject({
      status: "changed",
      text: "answer = 42\n",
    });
  });

  it("returns analysis and format preview data through one browser call", () => {
    expect(analyze_and_format_toml("answer=42\n", "1.1")).toMatchObject({
      analysis: { valid: true, stats: { keys: 1 } },
      format: { status: "changed", text: "answer = 42\n" },
      formatted_analysis: { valid: true, stats: { keys: 1 } },
    });
  });
});
