import { useCallback, useEffect, useReducer, useRef } from "react";

import type {
  AnalysisResult,
  Diagnostic,
  PlaygroundEngine,
  TokenSpan,
} from "../contracts";
import { EXAMPLES, findExample } from "../examples";
import type { PlaygroundCopy } from "../i18n";
import {
  loadSession,
  saveSession,
  type PlaygroundSession,
  type TomlVersion,
} from "../session";

export type ResultView = "preview" | "diagnostics" | "tokens";
export type ExecutionKind = "analyze" | "format" | "format-analyze";
export type PreviewStatus =
  | "pending"
  | "ready"
  | "refused"
  | "unavailable";

export interface ExecutionTiming {
  kind: ExecutionKind;
  durationMs: number;
}

export interface DownloadFile {
  name: string;
  text: string;
}

export interface PlaygroundServices {
  engine: PlaygroundEngine;
  storage: Storage;
  clipboard?: Pick<Clipboard, "writeText">;
  download?: (file: DownloadFile) => void;
  now?: () => number;
}

export interface PlaygroundState {
  session: PlaygroundSession;
  exampleId: string;
  analysis: AnalysisResult | null;
  formattedPreview: {
    source: string;
    tokens: readonly TokenSpan[];
  } | null;
  previewStatus: PreviewStatus;
  diagnostics: readonly Diagnostic[];
  execution: ExecutionTiming | null;
  busy: boolean;
  error: {
    title: string;
    message: string;
    hint: string;
  } | null;
  selectedView: ResultView;
  status: {
    valid: boolean | null;
    label: string;
    detail: string;
  };
  announcement: string;
}

type StatusDescriptor =
  | { kind: "loading" }
  | { kind: "edited" }
  | { kind: "applying-format" }
  | {
      kind: "analysis";
      valid: boolean;
      version: TomlVersion;
    }
  | { kind: "format-refused" }
  | { kind: "engine-unavailable" };

type ErrorDescriptor =
  | { kind: "engine"; message: string }
  | { kind: "copy-unavailable" }
  | { kind: "copy-failed"; message: string }
  | { kind: "download-failed"; message: string };

type AnnouncementDescriptor =
  | { kind: "none" }
  | { kind: "analyzing" }
  | { kind: "analysis-valid"; keys: number }
  | { kind: "analysis-issues"; count: number }
  | { kind: "formatting" }
  | { kind: "format-refused" }
  | { kind: "formatted" }
  | { kind: "format-unchanged" }
  | { kind: "copied" }
  | { kind: "downloaded" }
  | { kind: "engine-error"; message: string }
  | { kind: "action-error"; error: ErrorDescriptor };

interface InternalState
  extends Omit<PlaygroundState, "error" | "status" | "announcement"> {
  error: ErrorDescriptor | null;
  status: StatusDescriptor;
  announcement: AnnouncementDescriptor;
}

type Action =
  | { type: "session"; session: PlaygroundSession; exampleId?: string }
  | { type: "format-applied"; session: PlaygroundSession }
  | { type: "edited"; session: PlaygroundSession }
  | { type: "analysis-start"; announcement: AnnouncementDescriptor }
  | {
      type: "analysis-complete";
      analysis: AnalysisResult;
      execution: ExecutionTiming;
    }
  | {
      type: "refresh-complete";
      analysis: AnalysisResult;
      formattedPreview: PlaygroundState["formattedPreview"];
      diagnostics: readonly Diagnostic[];
      execution: ExecutionTiming;
      formatRefused: boolean;
    }
  | {
      type: "engine-failure";
      message: string;
      execution: ExecutionTiming;
    }
  | { type: "action-failure"; error: ErrorDescriptor }
  | { type: "action-complete"; announcement: AnnouncementDescriptor }
  | { type: "view"; view: ResultView }
  | { type: "announce"; announcement: AnnouncementDescriptor };

export interface PlaygroundActions {
  editSource(source: string): void;
  selectVersion(version: TomlVersion): void;
  selectExample(id: string): void;
  reset(): void;
  analyze(): Promise<void>;
  format(): Promise<void>;
  copy(): Promise<void>;
  download(): void;
  selectView(view: ResultView): void;
}

interface AnalyzeOptions {
  request?: number;
  completionAnnouncement?: AnnouncementDescriptor;
  startedAt?: number;
  executionKind?: ExecutionKind;
}

interface PendingOperation {
  request: number;
  kind: "analyze" | "format-apply" | "refresh";
  sessionKey: string;
}

const AUTO_REFRESH_DELAY_MS = 180;

export function usePlayground(
  services: PlaygroundServices,
  messages: PlaygroundCopy,
): {
  state: PlaygroundState;
  actions: PlaygroundActions;
} {
  const initialSession = useRef(loadSession(services.storage));
  const [state, dispatch] = useReducer(
    reducer,
    initialSession.current,
    initialize,
  );
  const sessionRef = useRef(state.session);
  const requestRef = useRef(0);
  const pendingRef = useRef<PendingOperation | null>(null);
  const now = services.now ?? monotonicNow;

  const store = useCallback(
    (session: PlaygroundSession) => {
      sessionRef.current = session;
      saveSession(services.storage, session);
    },
    [services.storage],
  );

  const analyzeSession = useCallback(
    async (
      session: PlaygroundSession,
      options: AnalyzeOptions = {},
    ): Promise<void> => {
      const request = options.request ?? ++requestRef.current;
      if (request !== requestRef.current) {
        return;
      }
      if (options.request === undefined) {
        pendingRef.current = {
          request,
          kind: "analyze",
          sessionKey: sessionKey(session),
        };
      }
      const startedAt = options.startedAt ?? now();
      store(session);
      dispatch({
        type: "analysis-start",
        announcement: { kind: "analyzing" },
      });
      try {
        const analysis = await services.engine.analyze(
          session.source,
          session.version,
        );
        if (request !== requestRef.current) {
          return;
        }
        clearPending(pendingRef, request);
        dispatch({
          type: "analysis-complete",
          analysis,
          execution: {
            kind: options.executionKind ?? "analyze",
            durationMs: elapsed(now, startedAt),
          },
        });
        dispatch({
          type: "announce",
          announcement:
            options.completionAnnouncement ??
            (analysis.valid
              ? { kind: "analysis-valid", keys: analysis.stats.keys }
              : {
                  kind: "analysis-issues",
                  count: analysis.diagnostics.length,
                }),
        });
      } catch (error: unknown) {
        if (request === requestRef.current) {
          clearPending(pendingRef, request);
          dispatch({
            type: "engine-failure",
            message: errorMessage(error),
            execution: {
              kind: options.executionKind ?? "analyze",
              durationMs: elapsed(now, startedAt),
            },
          });
        }
      }
    },
    [now, services.engine, store],
  );

  const editSource = useCallback(
    (source: string) => {
      requestRef.current += 1;
      pendingRef.current = null;
      const session = { ...sessionRef.current, source };
      store(session);
      dispatch({ type: "edited", session });
    },
    [store],
  );

  const selectVersion = useCallback(
    (version: TomlVersion) => {
      requestRef.current += 1;
      pendingRef.current = null;
      const session = { ...sessionRef.current, version };
      store(session);
      dispatch({ type: "session", session });
    },
    [store],
  );

  const selectExample = useCallback(
    (id: string) => {
      const example = findExample(id);
      if (example === undefined) {
        return;
      }
      requestRef.current += 1;
      pendingRef.current = null;
      const session = { source: example.source, version: example.version };
      store(session);
      dispatch({ type: "session", session, exampleId: example.id });
    },
    [store],
  );

  const reset = useCallback(() => {
    const example = EXAMPLES[0];
    if (example !== undefined) {
      selectExample(example.id);
    }
  }, [selectExample]);

  const format = useCallback(async () => {
    const startedAt = now();
    const request = ++requestRef.current;
    const session = sessionRef.current;
    let failureKind: ExecutionKind = "format";
    pendingRef.current = {
      request,
      kind: "format-apply",
      sessionKey: sessionKey(session),
    };
    dispatch({
      type: "analysis-start",
      announcement: { kind: "formatting" },
    });
    try {
      const result = await services.engine.format(session.source, session.version);
      if (request !== requestRef.current) {
        return;
      }
      if (result.status === "refused") {
        failureKind = "format-analyze";
        const analysis = await services.engine.analyze(
          session.source,
          session.version,
        );
        if (request !== requestRef.current) {
          return;
        }
        clearPending(pendingRef, request);
        const diagnostics = mergeDiagnostics(
          analysis.diagnostics,
          result.diagnostics,
        );
        dispatch({
          type: "refresh-complete",
          analysis,
          formattedPreview: null,
          diagnostics,
          execution: {
            kind: "format-analyze",
            durationMs: elapsed(now, startedAt),
          },
          formatRefused: true,
        });
        dispatch({
          type: "announce",
          announcement: analysis.valid
            ? { kind: "format-refused" }
            : {
                kind: "analysis-issues",
                count: diagnostics.length,
              },
        });
        return;
      }
      const next = { ...session, source: result.text };
      dispatch({ type: "format-applied", session: next });
      await analyzeSession(next, {
        request,
        startedAt,
        executionKind: "format-analyze",
        completionAnnouncement:
          result.status === "changed"
          ? { kind: "formatted" }
          : { kind: "format-unchanged" },
      });
    } catch (error: unknown) {
      if (request === requestRef.current) {
        clearPending(pendingRef, request);
        dispatch({
          type: "engine-failure",
          message: errorMessage(error),
          execution: {
            kind: failureKind,
            durationMs: elapsed(now, startedAt),
          },
        });
      }
    }
  }, [analyzeSession, now, services.engine]);

  const refreshSession = useCallback(async (session: PlaygroundSession) => {
    const startedAt = now();
    const request = ++requestRef.current;
    pendingRef.current = {
      request,
      kind: "refresh",
      sessionKey: sessionKey(session),
    };
    store(session);
    dispatch({
      type: "analysis-start",
      announcement: { kind: "formatting" },
    });
    try {
      const combined = await services.engine.analyzeAndFormat?.(
        session.source,
        session.version,
      );
      const analysis =
        combined?.analysis ??
        (await services.engine.analyze(session.source, session.version));
      if (request !== requestRef.current) {
        return;
      }
      const formatResult =
        combined?.format ??
        (await services.engine.format(session.source, session.version));
      if (request !== requestRef.current) {
        return;
      }
      let formattedPreview: PlaygroundState["formattedPreview"] = null;
      if (formatResult.status !== "refused") {
        const formattedSource =
          formatResult.status === "unchanged"
            ? session.source
            : formatResult.text;
        const previewAnalysis =
          formattedSource === session.source
            ? analysis
            : (combined?.formatted_analysis ??
              (await services.engine.analyze(
                formattedSource,
                session.version,
              )));
        if (request !== requestRef.current) {
          return;
        }
        formattedPreview = {
          source: formattedSource,
          tokens: previewAnalysis.tokens,
        };
      }
      clearPending(pendingRef, request);
      const diagnostics =
        formatResult.status === "refused"
          ? mergeDiagnostics(
              analysis.diagnostics,
              formatResult.diagnostics,
            )
          : analysis.diagnostics;
      dispatch({
        type: "refresh-complete",
        analysis,
        formattedPreview,
        diagnostics,
        execution: {
          kind: "format-analyze",
          durationMs: elapsed(now, startedAt),
        },
        formatRefused: formatResult.status === "refused",
      });
      dispatch({
        type: "announce",
        announcement:
          formatResult.status === "refused" && analysis.valid
            ? { kind: "format-refused" }
            : analysis.valid
              ? { kind: "analysis-valid", keys: analysis.stats.keys }
              : {
                  kind: "analysis-issues",
                  count: diagnostics.length,
                },
      });
    } catch (error: unknown) {
      if (request === requestRef.current) {
        clearPending(pendingRef, request);
        dispatch({
          type: "engine-failure",
          message: errorMessage(error),
          execution: {
            kind: "format-analyze",
            durationMs: elapsed(now, startedAt),
          },
        });
      }
    }
  }, [now, services.engine, store]);

  const analyze = useCallback(
    () => refreshSession(sessionRef.current),
    [refreshSession],
  );

  useEffect(() => {
    if (
      state.status.kind !== "loading" &&
      state.status.kind !== "edited"
    ) {
      return;
    }
    const session = state.session;
    const key = sessionKey(session);
    const delay =
      state.status.kind === "edited" ? AUTO_REFRESH_DELAY_MS : 0;
    const timeout = setTimeout(() => {
      if (sessionKey(sessionRef.current) !== key) {
        return;
      }
      const pending = pendingRef.current;
      if (pending !== null && pending.sessionKey === key) {
        return;
      }
      void refreshSession(session);
    }, delay);
    return () => clearTimeout(timeout);
  }, [
    refreshSession,
    state.session,
    state.status.kind,
  ]);

  const currentOutput = useCallback(
    () =>
      state.selectedView === "preview" && state.formattedPreview !== null
        ? state.formattedPreview.source
        : sessionRef.current.source,
    [state.formattedPreview, state.selectedView],
  );

  const copy = useCallback(async () => {
    try {
      const clipboard = services.clipboard ?? navigator.clipboard;
      if (clipboard === undefined) {
        dispatch({
          type: "action-failure",
          error: { kind: "copy-unavailable" },
        });
        return;
      }
      await clipboard.writeText(currentOutput());
      dispatch({
        type: "action-complete",
        announcement: { kind: "copied" },
      });
    } catch (error: unknown) {
      dispatch({
        type: "action-failure",
        error: { kind: "copy-failed", message: errorMessage(error) },
      });
    }
  }, [currentOutput, services.clipboard]);

  const download = useCallback(() => {
    try {
      (services.download ?? downloadInBrowser)({
        name: "tomlsmith-playground.toml",
        text: currentOutput(),
      });
      dispatch({
        type: "action-complete",
        announcement: { kind: "downloaded" },
      });
    } catch (error: unknown) {
      dispatch({
        type: "action-failure",
        error: { kind: "download-failed", message: errorMessage(error) },
      });
    }
  }, [currentOutput, services.download]);

  const selectView = useCallback((view: ResultView) => {
    dispatch({ type: "view", view });
  }, []);

  return {
    state: presentState(state, messages),
    actions: {
      editSource,
      selectVersion,
      selectExample,
      reset,
      analyze,
      format,
      copy,
      download,
      selectView,
    },
  };
}

function initialize(session: PlaygroundSession): InternalState {
  return {
    session,
    exampleId: "",
    analysis: null,
    formattedPreview: null,
    previewStatus: "pending",
    diagnostics: [],
    execution: null,
    busy: false,
    error: null,
    selectedView: "preview",
    status: { kind: "loading" },
    announcement: { kind: "none" },
  };
}

function reducer(state: InternalState, action: Action): InternalState {
  switch (action.type) {
    case "session":
      return {
        ...state,
        session: action.session,
        exampleId: action.exampleId ?? "",
        analysis: null,
        formattedPreview: null,
        previewStatus: "pending",
        diagnostics: [],
        execution: null,
        busy: false,
        error: null,
        status: { kind: "loading" },
      };
    case "format-applied":
      return {
        ...state,
        session: action.session,
        analysis: null,
        formattedPreview: null,
        previewStatus: "pending",
        diagnostics: [],
        execution: null,
        busy: false,
        error: null,
        status: { kind: "applying-format" },
      };
    case "edited":
      return {
        ...state,
        busy: true,
        error: null,
        session: action.session,
        exampleId: "",
        analysis: null,
        formattedPreview: null,
        previewStatus: "pending",
        diagnostics: [],
        execution: null,
        status: { kind: "edited" },
        announcement: { kind: "formatting" },
      };
    case "analysis-start":
      return {
        ...state,
        busy: true,
        error: null,
        execution: null,
        announcement: action.announcement,
      };
    case "analysis-complete":
      return {
        ...state,
        busy: false,
        error: null,
        analysis: action.analysis,
        formattedPreview: {
          source: state.session.source,
          tokens: action.analysis.tokens,
        },
        previewStatus: "ready",
        diagnostics: action.analysis.diagnostics,
        execution: action.execution,
        status: {
          kind: "analysis",
          valid: action.analysis.valid,
          version: action.analysis.version,
        },
      };
    case "refresh-complete":
      return {
        ...state,
        busy: false,
        error: null,
        analysis: action.analysis,
        formattedPreview: action.formattedPreview,
        previewStatus: action.formatRefused ? "refused" : "ready",
        diagnostics: action.diagnostics,
        execution: action.execution,
        status:
          action.formatRefused && action.analysis.valid
            ? { kind: "format-refused" }
            : {
                kind: "analysis",
                valid: action.analysis.valid,
                version: action.analysis.version,
              },
      };
    case "engine-failure":
      return {
        ...state,
        busy: false,
        previewStatus: "unavailable",
        error: { kind: "engine", message: action.message },
        execution: action.execution,
        status: { kind: "engine-unavailable" },
        announcement: { kind: "engine-error", message: action.message },
      };
    case "action-failure":
      return {
        ...state,
        error: action.error,
        announcement: { kind: "action-error", error: action.error },
      };
    case "action-complete":
      return { ...state, error: null, announcement: action.announcement };
    case "view":
      return { ...state, selectedView: action.view };
    case "announce":
      return { ...state, announcement: action.announcement };
  }
}

function presentState(
  state: InternalState,
  copy: PlaygroundCopy,
): PlaygroundState {
  return {
    ...state,
    error: state.error === null ? null : presentError(state.error, copy),
    status: presentStatus(state.status, copy),
    announcement: presentAnnouncement(state.announcement, copy),
  };
}

function presentStatus(
  status: StatusDescriptor,
  copy: PlaygroundCopy,
): PlaygroundState["status"] {
  switch (status.kind) {
    case "loading":
      return {
        valid: null,
        label: copy.status.loadingLabel,
        detail: copy.status.loadingDetail,
      };
    case "edited":
      return {
        valid: null,
        label: copy.status.refreshingLabel,
        detail: copy.status.refreshingDetail,
      };
    case "applying-format":
      return {
        valid: null,
        label: copy.status.applyingFormatLabel,
        detail: copy.status.applyingFormatDetail,
      };
    case "analysis":
      return {
        valid: status.valid,
        label: status.valid ? copy.status.validLabel : copy.status.issuesLabel,
        detail: copy.status.analysisDetail(status.version),
      };
    case "format-refused":
      return {
        valid: false,
        label: copy.status.formatRefusedLabel,
        detail: copy.status.formatRefusedDetail,
      };
    case "engine-unavailable":
      return {
        valid: false,
        label: copy.status.engineUnavailableLabel,
        detail: copy.status.engineUnavailableDetail,
      };
  }
}

function presentError(
  error: ErrorDescriptor,
  copy: PlaygroundCopy,
): NonNullable<PlaygroundState["error"]> {
  switch (error.kind) {
    case "engine":
      return {
        title: copy.errors.engineTitle,
        message: error.message,
        hint: copy.errors.engineHint,
      };
    case "copy-unavailable":
      return {
        title: copy.errors.copyUnavailableTitle,
        message: copy.errors.copyUnavailableMessage,
        hint: copy.errors.copyUnavailableHint,
      };
    case "copy-failed":
      return {
        title: copy.errors.copyFailedTitle,
        message: error.message,
        hint: copy.errors.copyFailedHint,
      };
    case "download-failed":
      return {
        title: copy.errors.downloadFailedTitle,
        message: error.message,
        hint: copy.errors.downloadFailedHint,
      };
  }
}

function presentAnnouncement(
  announcement: AnnouncementDescriptor,
  copy: PlaygroundCopy,
): string {
  switch (announcement.kind) {
    case "none":
      return "";
    case "analyzing":
      return copy.announcements.analyzing;
    case "analysis-valid":
      return copy.announcements.analysisValid(announcement.keys);
    case "analysis-issues":
      return copy.announcements.analysisIssues(announcement.count);
    case "formatting":
      return copy.announcements.formatting;
    case "format-refused":
      return copy.announcements.formatRefused;
    case "formatted":
      return copy.announcements.formatted;
    case "format-unchanged":
      return copy.announcements.formatUnchanged;
    case "copied":
      return copy.announcements.copied;
    case "downloaded":
      return copy.announcements.downloaded;
    case "engine-error":
      return copy.announcements.engineError(announcement.message);
    case "action-error": {
      const error = presentError(announcement.error, copy);
      return copy.announcements.actionFailure(error.title, error.message);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function elapsed(now: () => number, startedAt: number): number {
  const duration = now() - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function sessionKey(session: PlaygroundSession): string {
  return `${session.version}\u0000${session.source}`;
}

function mergeDiagnostics(
  primary: readonly Diagnostic[],
  secondary: readonly Diagnostic[],
): readonly Diagnostic[] {
  const diagnostics = [...primary];
  const seen = new Set(primary.map(diagnosticKey));
  for (const diagnostic of secondary) {
    const key = diagnosticKey(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function diagnosticKey(diagnostic: Diagnostic): string {
  const { code, severity, message, range } = diagnostic;
  return [code, severity, message, range.start, range.end].join("\u0000");
}

function clearPending(
  pendingRef: { current: PendingOperation | null },
  request: number,
): void {
  if (pendingRef.current?.request === request) {
    pendingRef.current = null;
  }
}

function downloadInBrowser(file: DownloadFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: "application/toml" }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
