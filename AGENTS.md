# TomlSmith Playground agent instructions

This repository is the browser adapter for the published [TomlSmith language core](https://crates.io/crates/tomlsmith). Read `CONTRIBUTING.md` before changing runtime behavior, the Rust/WASM contract, editor integration, localization, persistence, or layout.

## Ownership and boundaries

- Grammar, parsing, semantic analysis, diagnostics, formatting rules, and core highlighting behavior belong in the [TomlSmith core](https://github.com/tomlsmith/tomlsmith) repository. Keep this repository focused on Rust/WASM transport and browser interaction.
- Treat `src/lib.rs` and `web/src/contracts.ts` as one serialization contract. A schema change must update both sides, Rust adapter tests, and the real generated-WASM integration test.
- Keep the WASM surface limited to structured analyze and format operations. Preserve exact UTF-8 byte offsets across Rust and TypeScript; human-facing lines and columns use one-based Unicode-scalar coordinates.
- Depend on an exact crates.io `tomlsmith` version and commit the corresponding `Cargo.lock`. Update the version, lockfile, adapter contract, and generated-WebAssembly tests together when adopting a new core release.
- `web/src/generated/` is produced by `scripts/build-wasm.sh`. Regenerate it for verification, but do not edit or commit it.

## Browser behavior

- `web/src/hooks/usePlayground.ts` owns the asynchronous analysis and format-preview pipeline. Preserve debounced automatic refresh and latest-request-wins behavior when source, version, or example changes invalidate stale work.
- Keep format preview non-destructive until the user explicitly applies it, and preserve the selected result tab across edits and refreshes.
- Keep the page viewport fixed while controls, source, preview, diagnostics, and token views scroll within their own regions. Diagnostic or byte-rail navigation must move editor selection without scrolling or jumping the page.
- Keep source editing fully keyboard-operable: Tab and Shift+Tab indent or outdent, Escape followed by Tab releases editor focus, and diagnostic details remain available through hover and keyboard focus.
- Keep the editable CodeMirror `EditorView` lifecycle inside `SourceEditor`. Create it once and update content, callbacks, accessibility attributes, diagnostics, and extensions through transactions, refs, annotations, and compartments.
- Keep controllable UI copy and ARIA names in the typed dictionary in `web/src/i18n.tsx`; update English and Simplified Chinese together. Localize presentation around core diagnostics without rewriting the core diagnostic message.
- Locale switching is presentation state. It updates document language, metadata, and accessible copy without rebuilding CodeMirror, rerunning the engine, or changing the TOML session.
- Browser storage is best-effort. Editing must continue when reads or writes fail. Persist only working source, TOML version, and locale; do not persist generated preview output or upload source.
- Preserve visible focus, announcements, responsive behavior, and `prefers-reduced-motion` support when changing interactions.

## Tests and completion

- Start behavioral changes with a failing test at a public seam. Keep Rust adapter and serialization checks in native Rust tests.
- Use Vitest for every systematic JavaScript/TypeScript unit, integration, interaction, and end-to-end test; do not add standalone JavaScript test scripts.
- Exercise React behavior through `App` and observable UI. Mock the engine boundary in interaction tests while keeping `web/tests/wasm.integration.test.ts` against the real generated module.
- Verify manifest and policy constraints directly from their source files instead of adding artificial tests for `package.json` or equivalent files.
- For Rust or Rust/WASM changes, run `cargo fmt --all -- --check`, `cargo test --all-features`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo build --target wasm32-unknown-unknown --release`.
- For browser or cross-boundary changes, run `pnpm test`, `pnpm typecheck`, and `pnpm build`. Run both groups for cross-boundary changes; install with `pnpm install --frozen-lockfile` after a fresh checkout or lockfile change.
- If a dependency or toolchain pin changes, update both READMEs, CI, and the relevant lockfile in the same change.
- In the handoff, identify the public test seam, accessibility impact, and whether the Rust/WASM schema changed.

## Documentation

- Update `README.md` and `README.zh-Hans.md` together for user-facing behavior, requirements, or limitations. Keep implementation and contributor details in `CONTRIBUTING.md` rather than the README.
- Keep research, plans, ADR drafts, and roadmaps under the ignored `docs/` paths. Do not commit `target/`, `dist/`, `node_modules/`, or generated WASM bindings.
- Keep each ordinary Markdown paragraph, list item, and blockquote paragraph on one physical source line. Do not add trailing double-space hard breaks or repository-wide Markdown formatting dependencies.
