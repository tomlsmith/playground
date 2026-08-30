export type TomlVersion = "1.0" | "1.1";

export interface PlaygroundSession {
  source: string;
  version: TomlVersion;
}

const STORAGE_KEY = "tomlsmith.playground.session.v1";

export const DEFAULT_SESSION: Readonly<PlaygroundSession> = Object.freeze({
  source: `# TomlSmith project manifest
title = "TomlSmith Playground"
edition = "2024"
published = 2026-08-28

[workspace]
members = ["core", "formatter", "lsp"]

[[checks]]
name = "toml-test"
versions = ["1.0", "1.1"]
required = true
`,
  version: "1.1",
});

export function loadSession(storage: Storage): PlaygroundSession {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_SESSION };
    }
    const candidate: unknown = JSON.parse(raw);
    if (!isSession(candidate)) {
      return { ...DEFAULT_SESSION };
    }
    return candidate;
  } catch {
    return { ...DEFAULT_SESSION };
  }
}

export function saveSession(storage: Storage, session: PlaygroundSession): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Persistence is best-effort: private browsing and storage quotas must not block editing.
  }
}

function isSession(value: unknown): value is PlaygroundSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.source === "string" &&
    (candidate.version === "1.0" || candidate.version === "1.1")
  );
}
