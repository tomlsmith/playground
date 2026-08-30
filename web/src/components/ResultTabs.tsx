import { useEffect, useRef, type KeyboardEvent } from "react";

import type { Diagnostic, TokenSpan } from "../contracts";
import type { PreviewStatus, ResultView } from "../hooks/usePlayground";
import { useI18n } from "../i18n";
import { Diagnostics } from "./Diagnostics";
import { PreviewEditor } from "./PreviewEditor";
import { TokenLedger } from "./TokenLedger";

interface ResultTabsProps {
  source: string;
  previewTokens: readonly TokenSpan[];
  previewStatus: PreviewStatus;
  tokensSource: string;
  tokens: readonly TokenSpan[];
  diagnostics: readonly Diagnostic[];
  selected: ResultView;
  busy: boolean;
  loadingLabel: string;
  onSelect(view: ResultView): void;
  onDiagnostic(offset: number): void;
}

const tabs: ReadonlyArray<{
  view: ResultView;
  message: "preview" | "diagnostics" | "tokens";
  panel: string;
}> = [
  { view: "preview", message: "preview", panel: "preview-view" },
  {
    view: "diagnostics",
    message: "diagnostics",
    panel: "diagnostics-view",
  },
  { view: "tokens", message: "tokens", panel: "tokens-view" },
];

export function ResultTabs({
  source,
  previewTokens,
  previewStatus,
  tokensSource,
  tokens,
  diagnostics,
  selected,
  busy,
  loadingLabel,
  onSelect,
  onDiagnostic,
}: ResultTabsProps) {
  const { messages } = useI18n();
  const tablistRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tablist = tablistRef.current;
    if (tablist === null || !tablist.contains(document.activeElement)) {
      return;
    }
    tablist
      .querySelector<HTMLElement>(`#${selected}-tab`)
      ?.focus({ preventScroll: true });
  }, [selected]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const current = tabs.findIndex((tab) => tab.view === selected);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    const next = tabs[nextIndex];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    onSelect(next.view);
    queueMicrotask(() => {
      document.getElementById(`${next.view}-tab`)?.focus();
    });
  };

  return (
    <>
      <div
        ref={tablistRef}
        className="view-tabs"
        role="tablist"
        aria-label={messages.results.viewsLabel}
        onKeyDown={onTabKeyDown}
      >
        {tabs.map((tab) => (
          <button
            id={`${tab.view}-tab`}
            type="button"
            role="tab"
            aria-selected={selected === tab.view}
            aria-controls={tab.panel}
            tabIndex={selected === tab.view ? 0 : -1}
            onClick={() => onSelect(tab.view)}
            key={tab.view}
          >
            {messages.results[tab.message]}
          </button>
        ))}
      </div>
      <div className="result-views">
        <div
          id="preview-view"
          className="result-view result-view--preview"
          role="tabpanel"
          aria-labelledby="preview-tab"
          hidden={selected !== "preview"}
        >
          <PreviewEditor
            value={previewStatus === "ready" ? source : ""}
            tokens={previewStatus === "ready" ? previewTokens : []}
            label={messages.editor.previewLabel}
          />
          {previewStatus === "ready" ? null : (
            <div className="preview-placeholder">
              {previewStatus === "refused"
                ? messages.results.previewRefused
                : previewStatus === "unavailable"
                  ? messages.results.previewUnavailable
                  : messages.results.previewPending}
            </div>
          )}
        </div>
        <div
          id="diagnostics-view"
          className="result-view result-view--scrollable"
          role="tabpanel"
          aria-labelledby="diagnostics-tab"
          tabIndex={0}
          hidden={selected !== "diagnostics"}
        >
          <Diagnostics diagnostics={diagnostics} onSelect={onDiagnostic} />
        </div>
        <div
          id="tokens-view"
          className="result-view result-view--scrollable"
          role="tabpanel"
          aria-labelledby="tokens-tab"
          tabIndex={0}
          hidden={selected !== "tokens"}
        >
          <TokenLedger source={tokensSource} tokens={tokens} />
        </div>
        {busy ? (
          <div className="loading-state" role="status">
            <i aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
