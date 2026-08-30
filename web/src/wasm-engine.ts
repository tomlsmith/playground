import type {
  AnalysisResult,
  FormatResult,
  PlaygroundEngine,
  WorkbenchResult,
} from "./contracts";
import type { TomlVersion } from "./session";
import initWasm, {
  analyze_and_format_toml,
  analyze_toml,
  format_toml,
} from "./generated/tomlsmith_playground.js";

interface WasmModule {
  default(): Promise<unknown>;
  analyze_toml(source: string, version: string): AnalysisResult;
  format_toml(source: string, version: string): FormatResult;
  analyze_and_format_toml(source: string, version: string): WorkbenchResult;
}

export class BrowserWasmEngine implements PlaygroundEngine {
  readonly #loader: () => Promise<WasmModule>;
  #ready: Promise<WasmModule> | null;

  constructor(loader: () => Promise<WasmModule> = loadModule) {
    this.#loader = loader;
    this.#ready = instantiate(loader);
  }

  async analyze(
    source: string,
    version: TomlVersion,
  ): Promise<AnalysisResult> {
    return this.#call((module) => module.analyze_toml(source, version));
  }

  async format(source: string, version: TomlVersion): Promise<FormatResult> {
    return this.#call((module) => module.format_toml(source, version));
  }

  async analyzeAndFormat(
    source: string,
    version: TomlVersion,
  ): Promise<WorkbenchResult> {
    return this.#call((module) =>
      module.analyze_and_format_toml(source, version),
    );
  }

  // Run one engine operation; when loading or the call itself fails, drop
  // the cached instance so the next call re-instantiates the module.
  async #call<Output>(
    operation: (module: WasmModule) => Output,
  ): Promise<Output> {
    const ready = this.#ready ?? instantiate(this.#loader);
    this.#ready = ready;
    try {
      return operation(await ready);
    } catch (error: unknown) {
      if (this.#ready === ready) {
        this.#ready = null;
      }
      throw error;
    }
  }
}

async function instantiate(
  loader: () => Promise<WasmModule>,
): Promise<WasmModule> {
  const module = await loader();
  await module.default();
  return module;
}

async function loadModule(): Promise<WasmModule> {
  return {
    default: initWasm as WasmModule["default"],
    analyze_toml,
    format_toml,
    analyze_and_format_toml,
  };
}
