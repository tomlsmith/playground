#![forbid(unsafe_code)]

//! Browser-facing `TomlSmith` adapter.

use serde::Serialize;
use tomlsmith::{
    DeclarationKind, Diagnostic, Document, FormatOptions, FormatOutcome, HighlightKind, Severity,
    TomlVersion,
};
use wasm_bindgen::prelude::*;

/// TOML language edition selected by the caller.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum SourceVersion {
    #[serde(rename = "1.0")]
    V1_0,
    #[serde(rename = "1.1")]
    V1_1,
}

impl SourceVersion {
    fn core(self) -> TomlVersion {
        match self {
            Self::V1_0 => TomlVersion::V1_0,
            Self::V1_1 => TomlVersion::V1_1,
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "1.0" => Ok(Self::V1_0),
            "1.1" => Ok(Self::V1_1),
            _ => Err(format!(
                "unsupported TOML version `{value}`; expected `1.0` or `1.1`"
            )),
        }
    }
}

/// A UTF-8 byte range with one-based Unicode-scalar line and column coordinates.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SourceRange {
    pub start: u32,
    pub end: u32,
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PlaygroundDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub range: SourceRange,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct TokenSpan {
    pub kind: String,
    pub range: SourceRange,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct DocumentStats {
    pub bytes: usize,
    pub lines: usize,
    pub keys: usize,
    pub tables: usize,
    pub array_tables: usize,
    pub comments: usize,
    pub tokens: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct AnalysisResult {
    pub version: SourceVersion,
    pub valid: bool,
    pub diagnostics: Vec<PlaygroundDiagnostic>,
    pub tokens: Vec<TokenSpan>,
    pub stats: DocumentStats,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatStatus {
    Unchanged,
    Changed,
    Refused,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct FormatEdit {
    pub range: SourceRange,
    pub replacement: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct FormatResult {
    pub version: SourceVersion,
    pub status: FormatStatus,
    pub text: String,
    pub edits: Vec<FormatEdit>,
    pub diagnostics: Vec<PlaygroundDiagnostic>,
}

/// Analysis and format-preview data produced for one workbench refresh.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct WorkbenchResult {
    pub analysis: AnalysisResult,
    pub format: FormatResult,
    /// Analysis of changed formatted text. Unchanged or refused formatting leaves this empty.
    pub formatted_analysis: Option<AnalysisResult>,
}

/// Analyze source through the published `TomlSmith` language core.
#[must_use]
pub fn analyze(source: &str, version: SourceVersion) -> AnalysisResult {
    let line_map = LineMap::new(source);
    let document = Document::parse_as(source, version.core());
    analysis_from_document(source, version, &line_map, &document)
}

fn analysis_from_document(
    source: &str,
    version: SourceVersion,
    line_map: &LineMap,
    document: &Document,
) -> AnalysisResult {
    let valid = !document
        .diagnostics()
        .iter()
        .any(|diagnostic| diagnostic.severity() == Severity::Error);
    let diagnostics = diagnostics(source, line_map, document.diagnostics());
    let tokens = document
        .highlights()
        .iter()
        .map(|highlight| {
            let range = highlight.range();
            TokenSpan {
                kind: highlight_name(highlight.kind()).to_owned(),
                range: source_range(source, line_map, range.start(), range.end()),
            }
        })
        .collect::<Vec<_>>();
    let mut keys = 0;
    let mut tables = 0;
    let mut array_tables = 0;
    for declaration in document.semantics().declarations() {
        match declaration.kind() {
            DeclarationKind::KeyValue => keys += 1,
            DeclarationKind::Table => tables += 1,
            DeclarationKind::ArrayTable => array_tables += 1,
        }
    }
    let comments = tokens
        .iter()
        .filter(|token| token.kind == "comment")
        .count();

    AnalysisResult {
        version,
        valid,
        diagnostics,
        stats: DocumentStats {
            bytes: source.len(),
            lines: line_map.line_count(),
            keys,
            tables,
            array_tables,
            comments,
            tokens: tokens.len(),
        },
        tokens,
    }
}

/// Format source through the published `TomlSmith` language core.
#[must_use]
pub fn format(source: &str, version: SourceVersion) -> FormatResult {
    let line_map = LineMap::new(source);
    let document = Document::parse_as(source, version.core());
    format_from_outcome(source, version, &line_map, document.format())
}

fn format_from_outcome(
    source: &str,
    version: SourceVersion,
    line_map: &LineMap,
    outcome: FormatOutcome,
) -> FormatResult {
    match outcome {
        FormatOutcome::Unchanged => FormatResult {
            version,
            status: FormatStatus::Unchanged,
            text: source.to_owned(),
            edits: Vec::new(),
            diagnostics: Vec::new(),
        },
        FormatOutcome::Changed { text, edits } => FormatResult {
            version,
            status: FormatStatus::Changed,
            text: text.to_string(),
            edits: edits
                .iter()
                .map(|edit| FormatEdit {
                    range: source_range(source, line_map, edit.range().start(), edit.range().end()),
                    replacement: edit.replacement().to_owned(),
                })
                .collect(),
            diagnostics: Vec::new(),
        },
        FormatOutcome::Refused { diagnostics: found } => FormatResult {
            version,
            status: FormatStatus::Refused,
            text: source.to_owned(),
            edits: Vec::new(),
            diagnostics: diagnostics(source, line_map, &found),
        },
    }
}

/// Analyze the working copy and prepare its format preview in one adapter operation.
///
/// The working copy is parsed once. Changed formatted text is parsed once more so the preview can
/// carry its own highlight spans; unchanged or refused output reuses the working-copy result.
#[must_use]
pub fn analyze_and_format(source: &str, version: SourceVersion) -> WorkbenchResult {
    let line_map = LineMap::new(source);
    let options = FormatOptions {
        target_version: version.core(),
        ..FormatOptions::default()
    };
    let (document, outcome) = Document::parse_and_format_with(source, version.core(), &options);
    let analysis = analysis_from_document(source, version, &line_map, &document);
    let format = format_from_outcome(source, version, &line_map, outcome);
    let formatted_analysis =
        (format.status == FormatStatus::Changed).then(|| analyze(&format.text, version));

    WorkbenchResult {
        analysis,
        format,
        formatted_analysis,
    }
}

/// Report unrecoverable adapter panics to the browser console.
///
/// Runs once during WebAssembly module initialization so panic messages and
/// backtraces reach `console.error` instead of a bare `unreachable` trap.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
fn install_panic_reporting() {
    console_error_panic_hook::set_once();
}

/// JavaScript entry point for structured analysis.
///
/// # Errors
///
/// Returns a JavaScript error when the version is unsupported or serialization fails.
#[wasm_bindgen]
pub fn analyze_toml(source: &str, version: &str) -> Result<JsValue, JsValue> {
    let selected = SourceVersion::parse(version).map_err(|message| JsValue::from_str(&message))?;
    serde_wasm_bindgen::to_value(&analyze(source, selected))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

/// JavaScript entry point for structured formatting.
///
/// # Errors
///
/// Returns a JavaScript error when the version is unsupported or serialization fails.
#[wasm_bindgen]
pub fn format_toml(source: &str, version: &str) -> Result<JsValue, JsValue> {
    let selected = SourceVersion::parse(version).map_err(|message| JsValue::from_str(&message))?;
    serde_wasm_bindgen::to_value(&format(source, selected))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

/// JavaScript entry point for a combined workbench refresh.
///
/// # Errors
///
/// Returns a JavaScript error when the version is unsupported or serialization fails.
#[wasm_bindgen]
pub fn analyze_and_format_toml(source: &str, version: &str) -> Result<JsValue, JsValue> {
    let selected = SourceVersion::parse(version).map_err(|message| JsValue::from_str(&message))?;
    serde_wasm_bindgen::to_value(&analyze_and_format(source, selected))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

fn diagnostics(
    source: &str,
    line_map: &LineMap,
    diagnostics: &[Diagnostic],
) -> Vec<PlaygroundDiagnostic> {
    diagnostics
        .iter()
        .map(|diagnostic| PlaygroundDiagnostic {
            code: diagnostic.code().as_str().to_owned(),
            severity: match diagnostic.severity() {
                Severity::Error => "error",
                Severity::Warning => "warning",
            }
            .to_owned(),
            message: diagnostic.message().to_owned(),
            range: source_range(
                source,
                line_map,
                diagnostic.range().start(),
                diagnostic.range().end(),
            ),
        })
        .collect()
}

fn source_range(source: &str, line_map: &LineMap, start: u32, end: u32) -> SourceRange {
    let (line, column) = line_map.coordinates(source, start as usize);
    let (end_line, end_column) = line_map.coordinates(source, end as usize);
    SourceRange {
        start,
        end,
        line,
        column,
        end_line,
        end_column,
    }
}

/// Byte offsets of every line start, built once per call in O(n) so each
/// offset-to-coordinate lookup costs a binary search plus one line scan.
#[derive(Debug)]
struct LineMap {
    line_starts: Vec<usize>,
}

impl LineMap {
    fn new(source: &str) -> Self {
        let mut line_starts = vec![0];
        for (index, byte) in source.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(index + 1);
            }
        }
        Self { line_starts }
    }

    fn line_count(&self) -> usize {
        self.line_starts.len()
    }

    /// One-based Unicode-scalar line and column for a UTF-8 byte offset.
    fn coordinates(&self, source: &str, offset: usize) -> (u32, u32) {
        let mut bounded = offset.min(source.len());
        while !source.is_char_boundary(bounded) {
            bounded -= 1;
        }
        let line = self.line_starts.partition_point(|start| *start <= bounded);
        let line_start = self.line_starts[line - 1];
        (
            u32::try_from(line).unwrap_or(u32::MAX),
            u32::try_from(source[line_start..bounded].chars().count() + 1).unwrap_or(u32::MAX),
        )
    }
}

const fn highlight_name(kind: HighlightKind) -> &'static str {
    match kind {
        HighlightKind::Key => "key",
        HighlightKind::Table => "table",
        HighlightKind::String => "string",
        HighlightKind::Number => "number",
        HighlightKind::Boolean => "boolean",
        HighlightKind::DateTime => "datetime",
        HighlightKind::Comment => "comment",
        HighlightKind::Punctuation => "punctuation",
        HighlightKind::Invalid => "invalid",
    }
}
