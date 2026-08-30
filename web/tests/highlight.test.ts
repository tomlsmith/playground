import { describe, expect, it } from "vitest";

import { buildByteRail, segmentSource, tokenLexemes } from "../src/highlight";
import type { Diagnostic, TokenSpan } from "../src/contracts";

describe("UTF-8 result projection", () => {
  it("projects byte-based tokens onto JavaScript text without splitting Unicode", () => {
    const source = 'naïve = "值"\n';
    const tokens: TokenSpan[] = [
      token("key", 0, 6),
      token("punctuation", 7, 8),
      token("string", 9, 14),
    ];

    expect(segmentSource(source, tokens)).toEqual([
      { kind: "key", text: "naïve", start: 0, end: 6 },
      { kind: "plain", text: " ", start: 6, end: 7 },
      { kind: "punctuation", text: "=", start: 7, end: 8 },
      { kind: "plain", text: " ", start: 8, end: 9 },
      { kind: "string", text: '"值"', start: 9, end: 14 },
      { kind: "plain", text: "\n", start: 14, end: 15 },
    ]);
  });

  it("projects overlapping and repeated EOF tokens without duplicate gaps", () => {
    const source = "alpha = 1\n";
    const tokens: TokenSpan[] = [
      token("key", 0, 5),
      token("punctuation", 4, 7),
      token("number", 8, 9),
      token("invalid", 10, 10),
      token("invalid", 10, 10),
      token("invalid", 10, 10),
    ];

    const segments = segmentSource(source, tokens);
    const rangeKeys = segments.map(
      (segment) => `${segment.start}:${segment.end}:${segment.kind}`,
    );

    expect(segments.map((segment) => segment.text).join("")).toBe(source);
    expect(new Set(rangeKeys).size).toBe(rangeKeys.length);
    expect(segments.filter((segment) => segment.start === 9)).toEqual([
      { kind: "plain", text: "\n", start: 9, end: 10 },
    ]);
    expect(segments.every((segment) => segment.start < segment.end)).toBe(true);
  });

  it("slices token lexemes from the current source by byte range", () => {
    const source = 'naïve = "值"\n';
    const tokens: TokenSpan[] = [
      token("key", 0, 6),
      token("string", 9, 14),
      token("invalid", 90, 99),
    ];

    expect(tokenLexemes(source, tokens)).toEqual(["naïve", '"值"', ""]);
  });

  it("builds the signature rail from real line byte offsets and diagnostics", () => {
    const source = 'naïve = "值"\nnext = true\n';
    const diagnostic: Diagnostic = {
      code: "example.error",
      severity: "error",
      message: "Example",
      range: range(9, 14),
    };

    expect(buildByteRail(source, [diagnostic])).toEqual([
      {
        line: 1,
        offset: 0,
        label: "00000000",
        severity: "error",
        diagnostics: [diagnostic],
      },
      {
        line: 2,
        offset: 15,
        label: "0000000F",
        severity: null,
        diagnostics: [],
      },
      {
        line: 3,
        offset: 27,
        label: "0000001B",
        severity: null,
        diagnostics: [],
      },
    ]);
  });

  it("marks a zero-width diagnostic at the final UTF-8 byte", () => {
    const source = "[table";
    const diagnostic: Diagnostic = {
      code: "parse.unclosed-table-header",
      severity: "error",
      message: "table header is missing a closing bracket",
      range: range(6, 6),
    };

    expect(buildByteRail(source, [diagnostic])).toEqual([
      {
        line: 1,
        offset: 0,
        label: "00000000",
        severity: "error",
        diagnostics: [diagnostic],
      },
    ]);
  });
});

function token(
  kind: TokenSpan["kind"],
  start: number,
  end: number,
): TokenSpan {
  return { kind, range: range(start, end) };
}

function range(start: number, end: number) {
  return {
    start,
    end,
    line: 1,
    column: 1,
    end_line: 1,
    end_column: 1,
  };
}
