import { indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import {
  Annotation,
  Compartment,
  countColumn,
  EditorSelection,
  EditorState,
} from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import type { Diagnostic } from "../contracts";
import { useI18n } from "../i18n";

export interface CursorPosition {
  byte: number;
  line: number;
  column: number;
}

export interface SourceEditorHandle {
  selectByteOffset(offset: number): void;
  revealByteOffset(offset: number): void;
  focus(): void;
}

interface SourceEditorProps {
  value: string;
  diagnostics: readonly Diagnostic[];
  onChange(value: string): void;
  onAnalyze(): void;
  onFormat(): void;
  onCursor(position: CursorPosition): void;
  onScroll(scrollTop: number): void;
}

const externalUpdate = Annotation.define<boolean>();

export const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  function SourceEditor(
    {
      value,
      diagnostics,
      onChange,
      onAnalyze,
      onFormat,
      onCursor,
      onScroll,
    },
    forwardedRef,
  ) {
    const { messages } = useI18n();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const accessibilityCompartmentRef = useRef<Compartment | null>(null);
    if (accessibilityCompartmentRef.current === null) {
      accessibilityCompartmentRef.current = new Compartment();
    }
    const accessibilityCompartment = accessibilityCompartmentRef.current;
    const diagnosticCompartmentRef = useRef<Compartment | null>(null);
    if (diagnosticCompartmentRef.current === null) {
      diagnosticCompartmentRef.current = new Compartment();
    }
    const diagnosticCompartment = diagnosticCompartmentRef.current;
    const onChangeRef = useRef(onChange);
    const onAnalyzeRef = useRef(onAnalyze);
    const onFormatRef = useRef(onFormat);
    const onCursorRef = useRef(onCursor);
    const onScrollRef = useRef(onScroll);
    onChangeRef.current = onChange;
    onAnalyzeRef.current = onAnalyze;
    onFormatRef.current = onFormat;
    onCursorRef.current = onCursor;
    onScrollRef.current = onScroll;

    useImperativeHandle(
      forwardedRef,
      () => ({
        selectByteOffset(offset: number) {
          const view = viewRef.current;
          if (view === null) {
            return;
          }
          const position = utf16OffsetFromByte(view.state.doc.toString(), offset);
          view.dispatch({
            selection: EditorSelection.cursor(position),
          });
          view.focus();
        },
        revealByteOffset(offset: number) {
          const view = viewRef.current;
          if (view === null) {
            return;
          }
          const position = utf16OffsetFromByte(view.state.doc.toString(), offset);
          view.dispatch({
            selection: EditorSelection.cursor(position),
          });
          view.focus();
          scrollEditorToPosition(view, position);
        },
        focus() {
          viewRef.current?.focus();
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const host = hostRef.current;
      if (host === null) {
        return;
      }
      const view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: value,
          extensions: [
            minimalSetup,
            keymap.of([indentWithTab]),
            StreamLanguage.define(toml),
            accessibilityCompartment.of(
              EditorView.contentAttributes.of(
                contentAttributes(messages.editor.sourceLabel),
              ),
            ),
            EditorView.theme({
              "&": { height: "100%" },
              ".cm-scroller": { overflow: "auto" },
            }),
            EditorView.domEventHandlers({
              keydown(event) {
                const command = event.metaKey || event.ctrlKey;
                if (command && event.key === "Enter") {
                  event.preventDefault();
                  onAnalyzeRef.current();
                  return true;
                }
                if (
                  command &&
                  event.shiftKey &&
                  event.key.toLowerCase() === "f"
                ) {
                  event.preventDefault();
                  onFormatRef.current();
                  return true;
                }
                return false;
              },
            }),
            diagnosticCompartment.of([]),
            EditorView.updateListener.of((update) => {
              const fromExternal = update.transactions.some(
                (transaction) => transaction.annotation(externalUpdate) === true,
              );
              if (update.docChanged && !fromExternal) {
                onChangeRef.current(update.state.doc.toString());
              }
              if (update.docChanged || update.selectionSet) {
                onCursorRef.current(cursorPosition(update.state));
              }
            }),
          ],
        }),
      });
      viewRef.current = view;
      const scroll = () => onScrollRef.current(view.scrollDOM.scrollTop);
      view.scrollDOM.addEventListener("scroll", scroll, { passive: true });
      onCursorRef.current(cursorPosition(view.state));
      return () => {
        view.scrollDOM.removeEventListener("scroll", scroll);
        view.destroy();
        viewRef.current = null;
      };
      // The EditorView is deliberately created once. Mutable callbacks live in refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
      const view = viewRef.current;
      if (view === null) {
        return;
      }
      view.dispatch({
        effects: accessibilityCompartment.reconfigure(
          EditorView.contentAttributes.of(
            contentAttributes(messages.editor.sourceLabel),
          ),
        ),
      });
    }, [accessibilityCompartment, messages.editor.sourceLabel]);

    useLayoutEffect(() => {
      const view = viewRef.current;
      if (view === null || view.state.doc.toString() === value) {
        return;
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: externalUpdate.of(true),
      });
    }, [value]);

    useLayoutEffect(() => {
      const view = viewRef.current;
      if (view === null) {
        return;
      }
      const source = view.state.doc.toString();
      const marks = diagnostics.flatMap((diagnostic) => {
        const from = utf16OffsetFromByte(source, diagnostic.range.start);
        const rawTo = utf16OffsetFromByte(source, diagnostic.range.end);
        const to = Math.max(from, Math.min(rawTo, view.state.doc.length));
        if (from === to) {
          return [
            Decoration.widget({
              widget: new DiagnosticPin(diagnostic),
              side: 1,
            }).range(from),
          ];
        }
        return [
          Decoration.mark({
            class: `cm-diagnostic cm-diagnostic--${diagnostic.severity}`,
            attributes: { title: `${diagnostic.code}: ${diagnostic.message}` },
          }).range(from, to),
        ];
      });
      view.dispatch({
        effects: diagnosticCompartment.reconfigure(
          EditorView.decorations.of(Decoration.set(marks, true)),
        ),
      });
    }, [diagnosticCompartment, diagnostics, value]);

    return (
      <div
        id="source-editor"
        className="source-editor"
        data-source-editor
        tabIndex={-1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            viewRef.current?.focus();
          }
        }}
        ref={hostRef}
      />
    );
  },
);

function contentAttributes(label: string): Record<string, string> {
  return {
    "aria-label": label,
    "aria-multiline": "true",
    autocapitalize: "off",
    spellcheck: "false",
  };
}

function scrollEditorToPosition(view: EditorView, position: number): void {
  const line = view.lineBlockAt(position);
  const viewportHeight = view.scrollDOM.clientHeight;
  const centeredTop =
    line.top +
    view.documentPadding.top -
    Math.max(0, (viewportHeight - line.height) / 2);
  view.scrollDOM.scrollTop = Math.max(0, centeredTop);
  scrollEditorHorizontally(view, position);
  view.requestMeasure({
    read(currentView) {
      const cursor = currentView.coordsAtPos(position);
      const viewport = currentView.scrollDOM.getBoundingClientRect();
      return cursor === null ? null : { cursor, viewport };
    },
    write(measure, currentView) {
      if (measure === null) {
        return;
      }
      const margin = Math.min(24, measure.viewport.width / 4);
      if (measure.cursor.left < measure.viewport.left + margin) {
        currentView.scrollDOM.scrollLeft -=
          measure.viewport.left + margin - measure.cursor.left;
      } else if (measure.cursor.right > measure.viewport.right - margin) {
        currentView.scrollDOM.scrollLeft +=
          measure.cursor.right - (measure.viewport.right - margin);
      }
    },
  });
}

function scrollEditorHorizontally(view: EditorView, position: number): void {
  const viewportWidth = view.scrollDOM.clientWidth;
  if (viewportWidth <= 0) {
    return;
  }
  const documentLine = view.state.doc.lineAt(position);
  const offsetInLine = position - documentLine.from;
  const column = countColumn(
    documentLine.text,
    view.state.tabSize,
    offsetInLine,
  );
  const paddingLeft = Number.parseFloat(
    getComputedStyle(view.contentDOM).paddingLeft,
  );
  const cursorLeft =
    (Number.isFinite(paddingLeft) ? paddingLeft : 0) +
    column * view.defaultCharacterWidth;
  const margin = Math.min(24, viewportWidth / 4);
  const visibleLeft = view.scrollDOM.scrollLeft + margin;
  const visibleRight =
    view.scrollDOM.scrollLeft + viewportWidth - margin;
  if (cursorLeft < visibleLeft) {
    view.scrollDOM.scrollLeft = Math.max(0, cursorLeft - margin);
  } else if (cursorLeft > visibleRight) {
    view.scrollDOM.scrollLeft = cursorLeft - viewportWidth + margin;
  }
}

function cursorPosition(state: EditorState): CursorPosition {
  const offset = state.selection.main.head;
  const source = state.doc.toString();
  const line = state.doc.lineAt(offset);
  return {
    byte: new TextEncoder().encode(source.slice(0, offset)).length,
    line: line.number,
    column: [...source.slice(line.from, offset)].length + 1,
  };
}

function utf16OffsetFromByte(source: string, byteOffset: number): number {
  const bytes = new TextEncoder().encode(source);
  const bounded = Math.max(0, Math.min(byteOffset, bytes.length));
  return new TextDecoder().decode(bytes.slice(0, bounded)).length;
}

class DiagnosticPin extends WidgetType {
  constructor(private readonly diagnostic: Diagnostic) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof DiagnosticPin &&
      this.diagnostic.code === other.diagnostic.code &&
      this.diagnostic.severity === other.diagnostic.severity &&
      this.diagnostic.message === other.diagnostic.message
    );
  }

  toDOM(): HTMLElement {
    const pin = document.createElement("span");
    pin.className = `cm-diagnostic-pin cm-diagnostic-pin--${this.diagnostic.severity}`;
    pin.title = `${this.diagnostic.code}: ${this.diagnostic.message}`;
    pin.setAttribute("aria-hidden", "true");
    return pin;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
