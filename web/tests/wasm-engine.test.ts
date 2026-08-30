import { describe, expect, it } from "vitest";

import type { AnalysisResult, FormatResult } from "../src/contracts";
import type { TomlVersion } from "../src/session";
import { BrowserWasmEngine } from "../src/wasm-engine";

interface StubModule {
  default(): Promise<unknown>;
  analyze_toml(source: string, version: string): AnalysisResult;
  format_toml(source: string, version: string): FormatResult;
  analyze_and_format_toml(
    source: string,
    version: string,
  ): {
    analysis: AnalysisResult;
    format: FormatResult;
    formatted_analysis: AnalysisResult | null;
  };
}

describe("BrowserWasmEngine", () => {
  it("instantiates the module once for healthy calls", async () => {
    let loads = 0;
    const engine = new BrowserWasmEngine(async () => {
      loads += 1;
      return workingModule();
    });

    await expect(engine.analyze("a = 1\n", "1.1")).resolves.toMatchObject({
      valid: true,
    });
    await expect(engine.format("a = 1\n", "1.1")).resolves.toMatchObject({
      status: "unchanged",
    });
    expect(loads).toBe(1);
  });

  it("uses one combined WebAssembly call for an automatic workbench refresh", async () => {
    let combinedCalls = 0;
    const engine = new BrowserWasmEngine(async () => ({
      ...workingModule(),
      analyze_and_format_toml: (source, version) => {
        combinedCalls += 1;
        return combinedResult(source, version);
      },
    }));

    await expect(
      engine.analyzeAndFormat("answer=42\n", "1.1"),
    ).resolves.toMatchObject({
      analysis: { valid: true },
      format: { status: "changed", text: "answer = 42\n" },
      formatted_analysis: { valid: true },
    });
    expect(combinedCalls).toBe(1);
  });

  it("re-instantiates the module after an engine call throws", async () => {
    let loads = 0;
    let analyzeCalls = 0;
    const engine = new BrowserWasmEngine(async () => {
      loads += 1;
      return {
        ...workingModule(),
        analyze_toml: (source: string, version: string) => {
          analyzeCalls += 1;
          if (analyzeCalls === 1) {
            throw new Error("unreachable executed");
          }
          return analysis(source, version);
        },
      };
    });

    await expect(engine.analyze("a = 1\n", "1.1")).rejects.toThrow(
      "unreachable executed",
    );
    expect(loads).toBe(1);

    await expect(engine.analyze("a = 1\n", "1.1")).resolves.toMatchObject({
      valid: true,
    });
    expect(loads).toBe(2);
  });

  it("retries loading after the module fails to initialize", async () => {
    let loads = 0;
    const engine = new BrowserWasmEngine(async () => {
      loads += 1;
      if (loads === 1) {
        throw new Error("wasm fetch failed");
      }
      return workingModule();
    });

    await expect(engine.analyze("a = 1\n", "1.1")).rejects.toThrow(
      "wasm fetch failed",
    );
    await expect(engine.format("a = 1\n", "1.1")).resolves.toMatchObject({
      status: "unchanged",
    });
    expect(loads).toBe(2);
  });
});

function analysis(source: string, version: string): AnalysisResult {
  return {
    version: version as TomlVersion,
    valid: true,
    diagnostics: [],
    tokens: [],
    stats: {
      bytes: source.length,
      lines: source.split("\n").length,
      keys: 0,
      tables: 0,
      array_tables: 0,
      comments: 0,
      tokens: 0,
    },
  };
}

function workingModule(): StubModule {
  return {
    default: async () => undefined,
    analyze_toml: (source, version) => analysis(source, version),
    format_toml: (source, version) => ({
      version: version as TomlVersion,
      status: "unchanged",
      text: source,
      edits: [],
      diagnostics: [],
    }),
    analyze_and_format_toml: combinedResult,
  };
}

function combinedResult(source: string, version: string) {
  const formatted = source.replace("=", " = ");
  return {
    analysis: analysis(source, version),
    format: {
      version: version as TomlVersion,
      status: formatted === source ? ("unchanged" as const) : ("changed" as const),
      text: formatted,
      edits: [],
      diagnostics: [],
    },
    formatted_analysis:
      formatted === source ? analysis(source, version) : analysis(formatted, version),
  };
}
