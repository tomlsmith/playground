import type { Diagnostic } from "../contracts";
import { useI18n } from "../i18n";

interface DiagnosticsProps {
  diagnostics: readonly Diagnostic[];
  onSelect(offset: number): void;
}

export function Diagnostics({ diagnostics, onSelect }: DiagnosticsProps) {
  const { messages } = useI18n();

  if (diagnostics.length === 0) {
    return (
      <ol className="diagnostic-list">
        <li className="empty-state">
          <strong>{messages.diagnostics.emptyTitle}</strong>
          <span>{messages.diagnostics.emptyDetail}</span>
        </li>
      </ol>
    );
  }

  return (
    <ol className="diagnostic-list">
      {diagnostics.map((diagnostic, index) => (
        <li
          className={`diagnostic diagnostic--${diagnostic.severity}`}
          key={`${diagnostic.code}:${diagnostic.range.start}:${index}`}
        >
          <button
            type="button"
            aria-label={messages.diagnostics.itemLabel(diagnostic)}
            onClick={() => onSelect(diagnostic.range.start)}
          >
            <span className="diagnostic__header">
              <b className="diagnostic__severity">
                {messages.diagnostics.severity[diagnostic.severity]}
              </b>
              <span>
                {diagnostic.code} · {hexOffset(diagnostic.range.start)}
              </span>
            </span>
            <span className="diagnostic__message">{diagnostic.message}</span>
            <span className="diagnostic__location">
              {messages.diagnostics.location(diagnostic)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function hexOffset(offset: number): string {
  return offset.toString(16).toUpperCase().padStart(8, "0");
}
