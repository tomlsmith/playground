import { useRef, useState } from "react";

import type {
  ExecutionKind,
  PlaygroundActions,
  PlaygroundState,
} from "../hooks/usePlayground";
import { useI18n } from "../i18n";
import { ByteRail } from "./ByteRail";
import { ResultTabs } from "./ResultTabs";
import { Stats } from "./Stats";
import {
  SourceEditor,
  type CursorPosition,
  type SourceEditorHandle,
} from "./SourceEditor";

interface WorkbenchProps {
  state: PlaygroundState;
  actions: PlaygroundActions;
}

export function Workbench({ state, actions }: WorkbenchProps) {
  const { messages } = useI18n();
  const editorRef = useRef<SourceEditorHandle | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState<CursorPosition>({
    byte: 0,
    line: 1,
    column: 1,
  });
  const tokens = state.analysis?.tokens ?? [];
  const previewSource = state.formattedPreview?.source ?? "";
  const previewTokens = state.formattedPreview?.tokens ?? [];
  const canExport =
    state.selectedView !== "preview" || state.previewStatus === "ready";

  return (
    <section className="workbench" aria-label={messages.workbench.regionLabel}>
      <section className="bench-panel source-panel" aria-labelledby="source-title">
        <header className="panel-header">
          <div>
            <span className="panel-index">{messages.workbench.inputIndex}</span>
            <h2 id="source-title">{messages.workbench.sourceTitle}</h2>
          </div>
          <span className="cursor-readout">
            {messages.workbench.byte} {hexOffset(cursor.byte)} ·{" "}
            {messages.workbench.lineShort} {cursor.line} ·{" "}
            {messages.workbench.columnShort} {cursor.column}
          </span>
        </header>
        <div className="editor-stage">
          <ByteRail
            source={state.session.source}
            diagnostics={state.diagnostics}
            scrollTop={scrollTop}
            onSelect={(offset) => editorRef.current?.selectByteOffset(offset)}
          />
          <SourceEditor
            ref={editorRef}
            value={state.session.source}
            diagnostics={state.diagnostics}
            onChange={actions.editSource}
            onAnalyze={() => void actions.analyze()}
            onFormat={() => void actions.format()}
            onCursor={setCursor}
            onScroll={setScrollTop}
          />
        </div>
        <footer className="panel-footer">
          <span>{messages.workbench.byteRailFooter}</span>
          <span>{messages.workbench.locallySaved}</span>
        </footer>
      </section>

      <section
        className="bench-panel result-panel"
        aria-labelledby="result-title"
        aria-busy={state.busy}
      >
        <header className="panel-header result-header">
          <div className="result-header__summary">
            <span className="panel-index">{messages.workbench.outputIndex}</span>
            <h2
              id="result-title"
              data-status
              data-valid={
                state.status.valid === null ? "pending" : state.status.valid
              }
            >
              {state.status.label}
            </h2>
            <small>
              <span>{state.status.detail}</span>
              {state.execution === null ? null : (
                <span className="execution-timing">
                  <span aria-hidden="true">
                    {" · "}
                    {executionLabel(
                      state.execution.kind,
                      messages.playground.execution,
                    )}{" "}
                    Δt {formatDuration(state.execution.durationMs)} ms
                  </span>
                  <span className="visually-hidden">
                    {messages.playground.execution.elapsed(
                      executionLabel(
                        state.execution.kind,
                        messages.playground.execution,
                      ),
                      formatDuration(state.execution.durationMs),
                    )}
                  </span>
                </span>
              )}
            </small>
          </div>
          <div className="result-actions">
            <button
              type="button"
              className="text-action"
              disabled={!canExport}
              onClick={() => void actions.copy()}
            >
              {messages.workbench.copy}
            </button>
            <button
              type="button"
              className="text-action"
              disabled={!canExport}
              onClick={actions.download}
            >
              {messages.workbench.download}
            </button>
          </div>
          <Stats
            analysis={state.analysis}
            diagnosticCount={state.diagnostics.length}
          />
        </header>
        <ResultTabs
          source={previewSource}
          previewTokens={previewTokens}
          previewStatus={state.previewStatus}
          tokensSource={state.session.source}
          tokens={tokens}
          diagnostics={state.diagnostics}
          selected={state.selectedView}
          busy={state.busy}
          loadingLabel={
            state.announcement || messages.workbench.loadingFallback
          }
          onSelect={actions.selectView}
          onDiagnostic={(offset) => editorRef.current?.revealByteOffset(offset)}
        />
      </section>
    </section>
  );
}

function hexOffset(offset: number): string {
  return offset.toString(16).toUpperCase().padStart(8, "0");
}

function executionLabel(
  kind: ExecutionKind,
  copy: {
    analyze: string;
    format: string;
    formatAnalyze: string;
  },
): string {
  switch (kind) {
    case "analyze":
      return copy.analyze;
    case "format":
      return copy.format;
    case "format-analyze":
      return copy.formatAnalyze;
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 0.01) {
    return "<0.01";
  }
  if (durationMs < 10) {
    return durationMs.toFixed(2);
  }
  if (durationMs < 100) {
    return durationMs.toFixed(1);
  }
  return Math.round(durationMs).toString();
}
