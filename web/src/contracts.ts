import type { TomlVersion } from "./session";

export interface SourceRange {
  start: number;
  end: number;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  range: SourceRange;
}

export interface TokenSpan {
  kind:
    | "key"
    | "table"
    | "string"
    | "number"
    | "boolean"
    | "datetime"
    | "comment"
    | "punctuation"
    | "invalid";
  range: SourceRange;
}

export interface DocumentStats {
  bytes: number;
  lines: number;
  keys: number;
  tables: number;
  array_tables: number;
  comments: number;
  tokens: number;
}

export interface AnalysisResult {
  version: TomlVersion;
  valid: boolean;
  diagnostics: Diagnostic[];
  tokens: TokenSpan[];
  stats: DocumentStats;
}

export interface FormatEdit {
  range: SourceRange;
  replacement: string;
}

export interface FormatResult {
  version: TomlVersion;
  status: "unchanged" | "changed" | "refused";
  text: string;
  edits: FormatEdit[];
  diagnostics: Diagnostic[];
}

export interface WorkbenchResult {
  analysis: AnalysisResult;
  format: FormatResult;
  formatted_analysis: AnalysisResult | null;
}

export interface PlaygroundEngine {
  analyze(source: string, version: TomlVersion): Promise<AnalysisResult>;
  format(source: string, version: TomlVersion): Promise<FormatResult>;
  analyzeAndFormat?(
    source: string,
    version: TomlVersion,
  ): Promise<WorkbenchResult>;
}
