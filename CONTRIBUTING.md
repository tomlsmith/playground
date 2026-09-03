# Contributing to TomlSmith Playground

Thank you for improving the TomlSmith browser experience. The playground is intentionally a thin consumer of the published language core: grammar, semantic, formatter, and highlighter behavior belongs in [TomlSmith](https://github.com/tomlsmith/tomlsmith); browser transport and interaction behavior belongs here.

## Set up

Install Node.js 22.12 or newer, then install the pinned toolchain and start the dev server. Cargo obtains the exact TomlSmith core release recorded in `Cargo.toml` and `Cargo.lock` from crates.io:

```sh
rustup target add wasm32-unknown-unknown --toolchain 1.85.1
cargo install wasm-bindgen-cli --version 0.2.101 --locked
npm install --global pnpm@11.22.0
pnpm install --frozen-lockfile
pnpm dev
```

The dev server serves `http://localhost:4173`.

The WebAssembly build resolves the direct `tomlsmith` dependency through locked Cargo metadata and generates the runtime version module beside the WebAssembly bindings. Local development and release builds consume that generated value without a separately maintained version environment variable.

CI and deployment use `cargo --locked`, so they build the exact crates.io package and checksum recorded in `Cargo.lock`. A core update must change the exact dependency version, refresh the lockfile, run the native adapter and generated-WebAssembly suites, and commit any corresponding contract updates.

## Development rules

- Start behavioral changes with a failing test at a public seam, then implement the smallest behavior that makes it pass.
- Use native Rust contract tests for adapter shape and semantics.
- Use Vitest and React Testing Library for every JavaScript/TypeScript unit, integration, and interaction test; do not add standalone JavaScript test scripts.
- Mock only the generated WebAssembly boundary in React interaction tests. Keep at least one integration test loading the real generated module.
- Keep the CodeMirror `EditorView` lifecycle inside `SourceEditor`; use transactions, callback refs, and extension compartments instead of rebuilding it during React renders.
- Keep the WebAssembly exports limited to structured `analyze` and `format` operations.
- Preserve exact UTF-8 byte offsets across Rust and TypeScript. Human-facing columns use Unicode scalar values.
- Make every interaction keyboard accessible and retain `prefers-reduced-motion` behavior.
- Keep all controllable interface copy and ARIA names in the typed dictionary at `web/src/i18n.tsx`; update English and Simplified Chinese together.
- Treat language selection as presentation state: changing it must not rebuild CodeMirror, rerun analysis, or alter the TOML session. Persist the preference only through storage helpers that remain safe when browser storage reads or writes fail.
- Keep `document.documentElement.lang` synchronized with the selected interface language and cover language detection, persistence, switching, and representative translated interactions through the public React seam.
- Do not commit `target`, `dist`, `node_modules`, or generated files under `web/src/generated`.
- Do not add process notes under `docs/`; only durable user, contributor, architecture, or reference documentation belongs in version control.

## Before opening a pull request

```sh
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

If a dependency or toolchain pin changes, update both READMEs, CI, and the relevant lockfile in the same pull request.

## Commit and pull request scope

Keep changes reviewable and explain the user-visible behavior. A pull request should state its public test seam, include accessibility implications, and disclose whether it changes the Rust/WASM schema. By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
