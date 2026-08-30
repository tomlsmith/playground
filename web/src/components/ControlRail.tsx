import { EXAMPLES, isTomlVersion } from "../examples";
import { useI18n } from "../i18n";
import type { TomlVersion } from "../session";

interface ControlRailProps {
  version: TomlVersion;
  exampleId: string;
  onVersion(version: TomlVersion): void;
  onExample(id: string): void;
  onReset(): void;
}

export function ControlRail({
  version,
  exampleId,
  onVersion,
  onExample,
  onReset,
}: ControlRailProps) {
  const { messages } = useI18n();

  return (
    <section
      className="control-rail"
      aria-label={messages.controls.regionLabel}
    >
      <header className="control-rail__header">
        <span>{messages.controls.sectionLabel}</span>
        <h2>{messages.controls.title}</h2>
      </header>
      <div className="control-rail__fields">
        <label className="control">
          <span>{messages.controls.grammar}</span>
          <select
            value={version}
            aria-label={messages.controls.grammarLabel}
            onChange={(event) => {
              if (isTomlVersion(event.target.value)) {
                onVersion(event.target.value);
              }
            }}
          >
            <option value="1.1">TOML 1.1</option>
            <option value="1.0">TOML 1.0</option>
          </select>
        </label>
        <label className="control control--example">
          <span>{messages.controls.specimen}</span>
          <select
            value={exampleId}
            aria-label={messages.controls.exampleLabel}
            onChange={(event) => onExample(event.target.value)}
          >
            <option value="">{messages.controls.workingCopy}</option>
            {EXAMPLES.map((example) => {
              const copy = messages.controls.examples[example.id];
              return (
                <option value={example.id} key={example.id}>
                  {copy.label} — {copy.note}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <div className="control-rail__actions">
        <button
          className="button button--quiet"
          type="button"
          onClick={onReset}
        >
          {messages.controls.reset}
        </button>
      </div>
      <p className="control-rail__status">
        <i aria-hidden="true" />
        {messages.controls.automaticPipeline}
      </p>
    </section>
  );
}
