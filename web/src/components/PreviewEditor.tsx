import { StreamLanguage } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { Compartment, EditorState } from "@codemirror/state";
import { Decoration, EditorView, lineNumbers } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useLayoutEffect, useRef } from "react";

import type { TokenSpan } from "../contracts";

interface PreviewEditorProps {
  value: string;
  tokens: readonly TokenSpan[];
  label: string;
}

export function PreviewEditor({ value, tokens, label }: PreviewEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const accessibilityRef = useRef<Compartment | null>(null);
  const tokensRef = useRef<Compartment | null>(null);
  if (accessibilityRef.current === null) {
    accessibilityRef.current = new Compartment();
  }
  if (tokensRef.current === null) {
    tokensRef.current = new Compartment();
  }
  const accessibility = accessibilityRef.current;
  const tokenDecorations = tokensRef.current;

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
          lineNumbers(),
          StreamLanguage.define(toml),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          accessibility.of(
            EditorView.contentAttributes.of(contentAttributes(label)),
          ),
          tokenDecorations.of(tokenDecorationExtension(value, tokens)),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The EditorView is deliberately created once and updated transactionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    view.dispatch({
      effects: accessibility.reconfigure(
        EditorView.contentAttributes.of(contentAttributes(label)),
      ),
    });
  }, [accessibility, label]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const current = view.state.doc.toString();
    view.dispatch({
      changes:
        current === value
          ? undefined
          : { from: 0, to: view.state.doc.length, insert: value },
      effects: tokenDecorations.reconfigure(
        tokenDecorationExtension(value, tokens),
      ),
    });
  }, [tokenDecorations, tokens, value]);

  return (
    <div
      className="preview-editor"
      data-preview-editor
      ref={hostRef}
    />
  );
}

function contentAttributes(label: string): Record<string, string> {
  return {
    "aria-label": label,
    "aria-multiline": "true",
    "aria-readonly": "true",
    autocapitalize: "off",
    spellcheck: "false",
    tabindex: "0",
  };
}

function tokenDecorationExtension(
  source: string,
  tokens: readonly TokenSpan[],
) {
  const byteMap = new ByteToUtf16Map(source);
  const marks = tokens.flatMap((token) => {
    const from = byteMap.position(token.range.start);
    const to = byteMap.position(token.range.end);
    if (from >= to) {
      return [];
    }
    return [
      Decoration.mark({
        class: `cm-token cm-token--${token.kind}`,
        attributes: { "data-byte-start": String(token.range.start) },
      }).range(from, to),
    ];
  });
  return EditorView.decorations.of(Decoration.set(marks, true));
}

class ByteToUtf16Map {
  private readonly boundaries: Array<{ byte: number; utf16: number }> = [
    { byte: 0, utf16: 0 },
  ];

  constructor(source: string) {
    let byte = 0;
    let utf16 = 0;
    for (const character of source) {
      byte += utf8Width(character.codePointAt(0) ?? 0);
      utf16 += character.length;
      this.boundaries.push({ byte, utf16 });
    }
  }

  position(byteOffset: number): number {
    const bounded = Math.max(0, byteOffset);
    let low = 0;
    let high = this.boundaries.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const boundary = this.boundaries[middle];
      if (boundary === undefined) {
        break;
      }
      if (boundary.byte === bounded) {
        return boundary.utf16;
      }
      if (boundary.byte < bounded) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return this.boundaries[Math.max(0, high)]?.utf16 ?? 0;
  }
}

function utf8Width(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  if (codePoint <= 0xffff) {
    return 3;
  }
  return 4;
}
