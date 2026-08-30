import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";

import { App } from "./App";
import { resolveBrowserStorage } from "./browser-storage";
import { BrowserWasmEngine } from "./wasm-engine";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("TomlSmith Playground requires an #app mount point.");
}

createRoot(root).render(
  <StrictMode>
    <App
      coreVersion={import.meta.env.VITE_TOMLSMITH_CORE_VERSION}
      engine={new BrowserWasmEngine()}
      storage={resolveBrowserStorage(window)}
      repositoryUrl={import.meta.env.VITE_GITHUB_URL}
    />
  </StrictMode>,
);
