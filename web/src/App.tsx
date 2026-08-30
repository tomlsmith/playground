import type { MouseEvent } from "react";

import tomlsmithIconUrl from "./assets/tomlsmith-icon.svg";
import type { PlaygroundEngine } from "./contracts";
import { ControlRail } from "./components/ControlRail";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { RepositoryLink } from "./components/RepositoryLink";
import { Workbench } from "./components/Workbench";
import {
  usePlayground,
  type DownloadFile,
} from "./hooks/usePlayground";
import { I18nProvider, useI18n } from "./i18n";

interface AppProps {
  coreVersion?: string | null;
  engine: PlaygroundEngine;
  storage: Storage;
  clipboard?: Pick<Clipboard, "writeText">;
  download?: (file: DownloadFile) => void;
  now?: () => number;
  preferredLanguages?: readonly string[];
  repositoryUrl?: string | null;
}

export function App({
  coreVersion,
  engine,
  storage,
  clipboard,
  download,
  now,
  preferredLanguages,
  repositoryUrl,
}: AppProps) {
  return (
    <I18nProvider storage={storage} preferredLanguages={preferredLanguages}>
      <LocalizedApp
        coreVersion={coreVersion}
        engine={engine}
        storage={storage}
        clipboard={clipboard}
        download={download}
        now={now}
        repositoryUrl={repositoryUrl}
      />
    </I18nProvider>
  );
}

function LocalizedApp({
  coreVersion,
  engine,
  storage,
  clipboard,
  download,
  now,
  repositoryUrl,
}: AppProps) {
  const { messages } = useI18n();
  const { state, actions } = usePlayground(
    {
      engine,
      storage,
      clipboard,
      download,
      now,
    },
    messages.playground,
  );

  return (
    <div className="proofing-bench" aria-busy={state.busy}>
      <a className="skip-link" href="#source-editor" onClick={focusSourceEditor}>
        {messages.app.skipToSource}
      </a>
      <header className="masthead">
        <a className="wordmark" href="./" aria-label={messages.app.homeLabel}>
          <img
            className="wordmark__icon"
            src={tomlsmithIconUrl}
            alt=""
            aria-hidden="true"
          />
          <span>
            TOMLSMITH <b>/ PLAYGROUND</b>
          </span>
        </a>
        <div className="masthead__utilities">
          <span className="runtime-mark">
            <i aria-hidden="true" />
            <span className="runtime-mark__full">{messages.app.runtime}</span>
            <span className="runtime-mark__compact">
              {messages.app.runtimeCompact}
            </span>
          </span>
          <RepositoryLink href={repositoryUrl} />
          <LanguageSwitch />
        </div>
      </header>

      <div className="workspace-shell">
        <ControlRail
          version={state.session.version}
          exampleId={state.exampleId}
          onVersion={actions.selectVersion}
          onExample={actions.selectExample}
          onReset={actions.reset}
        />

        <div className="workspace-content">
          {state.error === null ? null : (
            <div className="engine-error" role="alert" tabIndex={0}>
              <strong>{state.error.title}</strong>
              <span>{state.error.message}</span>
              <small>{state.error.hint}</small>
            </div>
          )}

          <main className="playground-area">
            <Workbench state={state} actions={actions} />
          </main>
        </div>
      </div>

      <footer className="site-footer">
        <span>
          {messages.app.footerCore}
          {coreVersion?.trim()
            ? ` · core v${coreVersion.trim()}`
            : ""}
        </span>
        <span>{messages.app.footerPrivacy}</span>
      </footer>
      <p className="visually-hidden" aria-live="polite">
        {state.announcement}
      </p>
    </div>
  );
}

function focusSourceEditor(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  document.getElementById("source-editor")?.focus();
}
