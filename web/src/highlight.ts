import type { Diagnostic, TokenSpan } from "./contracts";

export interface HighlightSegment {
  kind: TokenSpan["kind"] | "plain";
  text: string;
  start: number;
  end: number;
}

export interface ByteRailMark {
  line: number;
  offset: number;
  label: string;
  severity: Diagnostic["severity"] | null;
  diagnostics: readonly Diagnostic[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function segmentSource(
  source: string,
  tokens: readonly TokenSpan[],
): HighlightSegment[] {
  const bytes = encoder.encode(source);
  const ordered = [...tokens].sort(
    (left, right) => left.range.start - right.range.start,
  );
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const token of ordered) {
    const start = Math.max(cursor, Math.min(token.range.start, bytes.length));
    const end = Math.max(start, Math.min(token.range.end, bytes.length));
    if (start > cursor) {
      segments.push(segment(bytes, "plain", cursor, start));
      cursor = start;
    }
    if (end > start) {
      segments.push(segment(bytes, token.kind, start, end));
      cursor = end;
    }
  }
  if (cursor < bytes.length) {
    segments.push(segment(bytes, "plain", cursor, bytes.length));
  }
  return segments;
}

export function tokenLexemes(
  source: string,
  tokens: readonly TokenSpan[],
): string[] {
  const bytes = encoder.encode(source);
  return tokens.map((token) => {
    const start = Math.min(Math.max(token.range.start, 0), bytes.length);
    const end = Math.max(start, Math.min(token.range.end, bytes.length));
    return decoder.decode(bytes.subarray(start, end));
  });
}

export function buildByteRail(
  source: string,
  diagnostics: readonly Diagnostic[],
): ByteRailMark[] {
  const encodedLines = source.split("\n").map((line) => encoder.encode(line));
  const marks: ByteRailMark[] = [];
  let offset = 0;

  for (const [index, line] of encodedLines.entries()) {
    const nextOffset = offset + line.length + (index < encodedLines.length - 1 ? 1 : 0);
    const isFinalLine = index === encodedLines.length - 1;
    const lineDiagnostics = diagnostics.filter(
      (diagnostic) =>
        diagnostic.range.start >= offset &&
        (diagnostic.range.start < nextOffset ||
          (isFinalLine && diagnostic.range.start === nextOffset)),
    );
    const severity = lineDiagnostics
      .reduce<Diagnostic["severity"] | null>(
        (current, diagnostic) =>
          current === "error" ? current : diagnostic.severity,
        null,
      );
    marks.push({
      line: index + 1,
      offset,
      label: offset.toString(16).toUpperCase().padStart(8, "0"),
      severity,
      diagnostics: lineDiagnostics,
    });
    offset = nextOffset;
  }
  return marks;
}

function segment(
  bytes: Uint8Array,
  kind: HighlightSegment["kind"],
  start: number,
  end: number,
): HighlightSegment {
  return {
    kind,
    text: decoder.decode(bytes.slice(start, end)),
    start,
    end,
  };
}
