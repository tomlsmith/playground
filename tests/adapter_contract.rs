use tomlsmith_playground::{FormatStatus, SourceVersion, analyze, analyze_and_format, format};

#[test]
fn analysis_reports_version_tokens_diagnostics_and_statistics() {
    let result = analyze(
        "title = \"TomlSmith\"\n[workspace]\nmembers = [\"core\", \"web\"]\n",
        SourceVersion::V1_0,
    );

    assert!(result.valid);
    assert_eq!(result.version, SourceVersion::V1_0);
    assert!(result.diagnostics.is_empty());
    assert_eq!(result.stats.bytes, 58);
    assert_eq!(result.stats.lines, 4);
    assert_eq!(result.stats.keys, 2);
    assert_eq!(result.stats.tables, 1);
    assert!(result.tokens.iter().any(|token| token.kind == "table"));
    assert!(result.tokens.iter().any(|token| token.kind == "string"));
}

#[test]
fn analysis_preserves_structural_highlight_kinds_from_the_core_crate() {
    let source = "[workspace]\nmembers = [\"core\"]\nmetadata = { enabled = true }\n[[bin]]\n";
    let result = analyze(source, SourceVersion::V1_1);
    let source_backed = result
        .tokens
        .iter()
        .map(|token| {
            (
                token.kind.as_str(),
                &source[token.range.start as usize..token.range.end as usize],
            )
        })
        .collect::<Vec<_>>();

    assert!(source_backed.contains(&("table", "workspace")));
    assert!(source_backed.contains(&("array-key", "members")));
    assert!(source_backed.contains(&("inline-table-key", "metadata")));
    assert!(source_backed.contains(&("key", "enabled")));
    assert!(source_backed.contains(&("array-table", "bin")));
}

#[test]
fn analysis_applies_the_selected_language_version() {
    let result = analyze("escape = \"\\e\"\n", SourceVersion::V1_0);

    assert!(!result.valid);
    assert_eq!(result.diagnostics.len(), 1);
    assert_eq!(result.diagnostics[0].code, "version.toml-1.1-syntax");
    assert_eq!(result.diagnostics[0].range.start, 10);
    assert_eq!(result.diagnostics[0].range.end, 12);
}

#[test]
fn formatting_returns_the_complete_text_and_precise_edits() {
    let result = format("answer=42\n", SourceVersion::V1_1);

    assert_eq!(result.status, FormatStatus::Changed);
    assert_eq!(result.text, "answer = 42\n");
    assert_eq!(result.edits.len(), 1);
    assert_eq!(result.edits[0].range.start, 0);
    assert_eq!(result.edits[0].range.end, 10);
    assert_eq!(result.edits[0].replacement, "answer = 42\n");
    assert!(result.diagnostics.is_empty());
}

#[test]
fn formatting_refuses_invalid_input_without_discarding_it() {
    let source = "answer = [1 2]\n";
    let result = format(source, SourceVersion::V1_1);

    assert_eq!(result.status, FormatStatus::Refused);
    assert_eq!(result.text, source);
    assert!(!result.diagnostics.is_empty());
}

#[test]
fn combined_workbench_operation_reuses_the_source_analysis() {
    let source = "answer=42\n";
    let result = analyze_and_format(source, SourceVersion::V1_1);

    assert_eq!(result.analysis, analyze(source, SourceVersion::V1_1));
    assert_eq!(result.format, format(source, SourceVersion::V1_1));
    assert_eq!(result.format.status, FormatStatus::Changed);
    assert_eq!(result.format.text, "answer = 42\n");
    assert_eq!(
        result.formatted_analysis,
        Some(analyze("answer = 42\n", SourceVersion::V1_1))
    );
}

#[test]
fn public_results_have_a_stable_serialized_shape() {
    let value = serde_json::to_value(analyze("ready = true\n", SourceVersion::V1_1))
        .expect("analysis should serialize");

    assert_eq!(value["version"], "1.1");
    assert_eq!(value["valid"], true);
    assert_eq!(value["stats"]["keys"], 1);
    assert_eq!(value["tokens"][0]["kind"], "key");
    assert!(
        value["tokens"][0].get("text").is_none(),
        "token spans must not duplicate source text"
    );
}

#[test]
fn ranges_keep_byte_offsets_and_report_human_character_columns() {
    let result = analyze("é = 1\n", SourceVersion::V1_1);
    let equals = result
        .tokens
        .iter()
        .find(|token| token.kind == "punctuation" && token.range.start == 3)
        .expect("equals token should be highlighted");

    assert_eq!(equals.range.start, 3);
    assert_eq!(equals.range.end, 4);
    assert_eq!(equals.range.line, 1);
    assert_eq!(equals.range.column, 3);
    assert_eq!(equals.range.end_column, 4);
}

#[test]
fn large_documents_analyze_quickly_with_exact_coordinates() {
    use std::fmt::Write as _;

    let mut source = String::new();
    for table in 0..200 {
        writeln!(source, "[table_{table}]").expect("write to string");
        writeln!(source, "# secção de configuração {table}").expect("write to string");
        for key in 0..20 {
            writeln!(source, "key_{table}_{key} = \"värde {key}\"").expect("write to string");
        }
    }

    let result = analyze(&source, SourceVersion::V1_1);

    assert!(result.valid);
    assert_eq!(
        result.stats.lines,
        source.bytes().filter(|byte| *byte == b'\n').count() + 1
    );
    assert!(result.stats.tokens > 4_000);
    for token in result.tokens.iter().step_by(97) {
        let start = usize::try_from(token.range.start).expect("offset fits usize");
        let end = usize::try_from(token.range.end).expect("offset fits usize");
        assert_eq!(
            (token.range.line, token.range.column),
            naive_coordinates(&source, start),
            "start coordinates for byte offset {start}"
        );
        assert_eq!(
            (token.range.end_line, token.range.end_column),
            naive_coordinates(&source, end),
            "end coordinates for byte offset {end}"
        );
    }
}

/// Reference implementation: full prefix scan per offset, kept only to
/// cross-check the adapter's line-map based coordinate conversion.
fn naive_coordinates(source: &str, offset: usize) -> (u32, u32) {
    let bounded = offset.min(source.len());
    let prefix = &source[..bounded];
    let line = prefix.split('\n').count();
    let line_start = prefix.rfind('\n').map_or(0, |index| index + 1);
    (
        u32::try_from(line).expect("line fits u32"),
        u32::try_from(source[line_start..bounded].chars().count() + 1).expect("column fits u32"),
    )
}
