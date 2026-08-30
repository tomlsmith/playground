import type { PlaygroundSession, TomlVersion } from "./session";

export interface PlaygroundExample extends PlaygroundSession {
  id: PlaygroundExampleId;
}

export type PlaygroundExampleId =
  | "workspace"
  | "toml-1-0"
  | "toml-1-1"
  | "diagnostics";

export const EXAMPLES: readonly PlaygroundExample[] = [
  {
    id: "workspace",
    version: "1.1",
    source: `# A compact workspace manifest
name = "forge"
owners = ["infra", "language-tools"]
released = 2026-08-28T14:30:00+08:00

[build]
target = "wasm32-unknown-unknown"
optimize = true

[[checks]]
name = "conformance"
versions = ["1.0", "1.1"]

[[checks]]
name = "format"
width = 100
`,
  },
  {
    id: "toml-1-0",
    version: "1.0",
    source: `title = "TOML 1.0 baseline"
point.x = 12
point.y = -4
enabled = true
palette = [0x1C4E80, 0xE36B3A, 0x2D7D6E]
`,
  },
  {
    id: "toml-1-1",
    version: "1.1",
    source: `escape = "press\\e[2K"
byte = "\\x54"
clock = 14:30
profile = {
  name = "release",
  checks = ["lint", "test"],
}
`,
  },
  {
    id: "diagnostics",
    version: "1.1",
    source: `mode = "strict"
mode = "relaxed"
ports = [8080 8081]
`,
  },
];

export function findExample(id: string): PlaygroundExample | undefined {
  return EXAMPLES.find((example) => example.id === id);
}

export function isTomlVersion(value: string): value is TomlVersion {
  return value === "1.0" || value === "1.1";
}
