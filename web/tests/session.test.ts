import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION, loadSession, saveSession } from "../src/session";

describe("playground session", () => {
  it("starts from the representative TOML example", () => {
    const storage = new MemoryStorage();

    expect(loadSession(storage)).toEqual(DEFAULT_SESSION);
  });

  it("restores source and language version across visits", () => {
    const storage = new MemoryStorage();
    saveSession(storage, { source: "escape = \"\\e\"\n", version: "1.1" });

    expect(loadSession(storage)).toEqual({
      source: "escape = \"\\e\"\n",
      version: "1.1",
    });
  });

  it("falls back safely when persisted data is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem("tomlsmith.playground.session.v1", "not-json");

    expect(loadSession(storage)).toEqual(DEFAULT_SESSION);
  });
});

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}
