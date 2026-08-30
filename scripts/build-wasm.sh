#!/usr/bin/env bash
set -euo pipefail

playground_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cargo_command="${CARGO_COMMAND:-cargo}"
wasm_bindgen_command="${WASM_BINDGEN_COMMAND:-wasm-bindgen}"
wasm_target="${playground_root}/target/wasm32-unknown-unknown/release/tomlsmith_playground.wasm"
wasm_output="${playground_root}/web/src/generated"

"${cargo_command}" build \
  --manifest-path "${playground_root}/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

mkdir -p "${wasm_output}"
"${wasm_bindgen_command}" \
  --target web \
  --out-dir "${wasm_output}" \
  --out-name tomlsmith_playground \
  "${wasm_target}"
