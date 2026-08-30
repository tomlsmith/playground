import { describe, expect, it } from "vitest";

import { loadLocale, saveLocale } from "../src/i18n";

describe("interface locale preference", () => {
  it("uses the first supported browser language", () => {
    const storage = new MemoryStorage();

    expect(loadLocale(storage, ["en-US", "zh-CN"])).toBe("en");
    expect(loadLocale(storage, ["fr-FR", "zh-TW", "en-US"])).toBe(
      "zh-Hans",
    );
  });

  it("gives a valid saved choice precedence over browser languages", () => {
    const storage = new MemoryStorage();
    storage.setItem("tomlsmith.playground.locale.v1", "zh-Hans");

    expect(loadLocale(storage, ["en-US"])).toBe("zh-Hans");
  });

  it("falls back to language detection when storage reads fail", () => {
    const storage = new RejectingStorage("read");

    expect(loadLocale(storage, ["zh-CN"])).toBe("zh-Hans");
  });

  it("treats persistence as best effort when storage writes fail", () => {
    const storage = new RejectingStorage("write");

    expect(() => saveLocale(storage, "zh-Hans")).not.toThrow();
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

class RejectingStorage implements Storage {
  constructor(private readonly rejection: "read" | "write") {}

  get length(): number {
    return 0;
  }

  clear(): void {}

  getItem(): string | null {
    if (this.rejection === "read") {
      throw new DOMException("Storage read blocked", "SecurityError");
    }
    return null;
  }

  key(): string | null {
    return null;
  }

  removeItem(): void {}

  setItem(): void {
    if (this.rejection === "write") {
      throw new DOMException("Storage write blocked", "SecurityError");
    }
  }
}
