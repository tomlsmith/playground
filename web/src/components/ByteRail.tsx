import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Diagnostic } from "../contracts";
import { buildByteRail } from "../highlight";
import { useI18n } from "../i18n";

interface ByteRailProps {
  source: string;
  diagnostics: readonly Diagnostic[];
  scrollTop: number;
  onSelect(offset: number): void;
}

export function ByteRail({
  source,
  diagnostics,
  scrollTop,
  onSelect,
}: ByteRailProps) {
  const { messages } = useI18n();
  const tooltipPrefix = useId();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef(new Map<number, HTMLButtonElement>());
  const tooltipRefs = useRef(new Map<number, HTMLDivElement>());
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null);
  const [focusedOffset, setFocusedOffset] = useState<number | null>(null);
  const [tooltipTop, setTooltipTop] = useState(8);
  const marks = useMemo(
    () => buildByteRail(source, diagnostics),
    [source, diagnostics],
  );
  const activeOffset = hoveredOffset ?? focusedOffset;

  useLayoutEffect(() => {
    if (activeOffset === null) {
      return;
    }
    const layer = layerRef.current;
    const button = buttonRefs.current.get(activeOffset);
    const tooltip = tooltipRefs.current.get(activeOffset);
    if (layer === null || button === undefined || tooltip === undefined) {
      return;
    }
    const layerRect = layer.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const inset = 8;
    const preferred =
      buttonRect.top -
      layerRect.top +
      (buttonRect.height - tooltipRect.height) / 2;
    const maximum = Math.max(
      inset,
      layerRect.height - tooltipRect.height - inset,
    );
    const next = Math.min(Math.max(inset, preferred), maximum);
    setTooltipTop((current) =>
      Math.abs(current - next) < 0.25 ? current : next,
    );
  }, [activeOffset, marks, scrollTop]);

  return (
    <div
      className="byte-rail-layer"
      onMouseLeave={() => setHoveredOffset(null)}
      ref={layerRef}
    >
      <aside className="byte-rail" aria-label={messages.byteRail.label}>
        <ol style={{ transform: `translateY(${-scrollTop}px)` }}>
          {marks.map((mark) => {
            const tooltipId = byteRailTooltipId(
              tooltipPrefix,
              mark.line,
              mark.offset,
            );
            const hasDiagnostics = mark.diagnostics.length > 0;
            return (
              <li
                className={
                  mark.severity === null
                    ? undefined
                    : `rail-mark--${mark.severity}`
                }
                key={`${mark.line}:${mark.offset}`}
              >
                <button
                  ref={(node) => {
                    if (node === null) {
                      buttonRefs.current.delete(mark.offset);
                    } else {
                      buttonRefs.current.set(mark.offset, node);
                    }
                  }}
                  type="button"
                  aria-describedby={hasDiagnostics ? tooltipId : undefined}
                  aria-label={messages.byteRail.lineLabel(
                    mark.line,
                    mark.offset,
                    mark.severity,
                    mark.diagnostics.length,
                  )}
                  onBlur={() => setFocusedOffset(null)}
                  onClick={() => onSelect(mark.offset)}
                  onFocus={() => {
                    if (hasDiagnostics) {
                      setFocusedOffset(mark.offset);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && hasDiagnostics) {
                      event.preventDefault();
                      setFocusedOffset(null);
                      setHoveredOffset(null);
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredOffset(hasDiagnostics ? mark.offset : null);
                  }}
                >
                  <span>{mark.label}</span>
                  <i aria-hidden="true">
                    <span>
                      {mark.severity === null
                        ? ""
                        : messages.diagnostics.severity[mark.severity].slice(
                            0,
                            1,
                          )}
                    </span>
                  </i>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      {marks.map((mark) => {
        if (mark.diagnostics.length === 0) {
          return null;
        }
        const tooltipId = byteRailTooltipId(
          tooltipPrefix,
          mark.line,
          mark.offset,
        );
        const visible = activeOffset === mark.offset;
        return (
          <div
            className="byte-rail-tooltip"
            hidden={!visible}
            id={tooltipId}
            key={tooltipId}
            onMouseEnter={() => setHoveredOffset(mark.offset)}
            ref={(node) => {
              if (node === null) {
                tooltipRefs.current.delete(mark.offset);
              } else {
                tooltipRefs.current.set(mark.offset, node);
              }
            }}
            role="tooltip"
            style={visible ? { top: `${tooltipTop}px` } : undefined}
          >
            <ul>
              {mark.diagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.code}:${diagnostic.range.start}:${index}`}
                >
                  <span className="byte-rail-tooltip__heading">
                    <strong data-severity={diagnostic.severity}>
                      {messages.diagnostics.severity[diagnostic.severity]}
                    </strong>
                    <code>{diagnostic.code}</code>
                  </span>
                  <span className="byte-rail-tooltip__message">
                    {diagnostic.message}
                  </span>
                  <small>{messages.diagnostics.location(diagnostic)}</small>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function byteRailTooltipId(prefix: string, line: number, offset: number): string {
  return `${prefix}-byte-rail-${line}-${offset}`;
}
