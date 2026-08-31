# TomlSmith Playground

**English** | [简体中文](README.zh-Hans.md)

[![CI](https://github.com/tomlsmith/playground/actions/workflows/ci.yml/badge.svg)](https://github.com/tomlsmith/playground/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Check and format TOML 1.0 and 1.1 in the browser.**

TomlSmith Playground uses [TomlSmith](https://github.com/tomlsmith/tomlsmith) through WebAssembly. Analysis and formatting run in the current browser tab.

[Open the Playground](https://tomlsmith.github.io/playground/) or run the workbench from a source checkout. This checkout pins TomlSmith core `0.3.0`; Cargo, CI, and deployment obtain that exact release from crates.io using `Cargo.toml` and `Cargo.lock`.

## Features

- Switch explicitly between TOML 1.0 and TOML 1.1.
- New and reset sessions start in TOML 1.1; the selected version is stored with the local working copy.
- Diagnostics and the format preview refresh automatically as you edit. The preview changes the source only when you apply it.
- Navigate diagnostics by source position and read messages on hover or keyboard focus.
- Inspect the formatted document, diagnostics, tokens, and document statistics side by side.
- Start from an included example, then copy, download, or apply the formatted result.
- Choose an English or Simplified Chinese interface. Source is not uploaded.
- Deployed builds show the exact TomlSmith core crate version in the footer.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Analyze now | <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> |
| Format and apply to the editor | <kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> |
| Indent or outdent | <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> |
| Move focus out of the editor | <kbd>Escape</kbd>, then <kbd>Tab</kbd> |

## Privacy

The playground stores only the latest source, selected TOML version, and interface language in browser-local storage. It does not upload source or persist the generated format preview. Clear site data or choose **Reset** to remove the saved working copy.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development and verification instructions.

## License

TomlSmith Playground is released under the [MIT License](LICENSE).
