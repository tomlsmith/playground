import { EditorView } from "@codemirror/view";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { App } from "../src/App";
import { resolveBrowserStorage } from "../src/browser-storage";
import { PreviewEditor } from "../src/components/PreviewEditor";
import type {
  AnalysisResult,
  FormatResult,
  PlaygroundEngine,
} from "../src/contracts";
import { saveSession, type TomlVersion } from "../src/session";

const playgroundStyles = readFileSync("web/src/styles.css", "utf8");

describe("TomlSmith React playground", () => {
  it("uses one combined engine operation for an automatic refresh", async () => {
    let combinedCalls = 0;
    let legacyCalls = 0;
    const engine: PlaygroundEngine = {
      analyze: async () => {
        legacyCalls += 1;
        throw new Error("automatic refresh must use the combined operation");
      },
      format: async () => {
        legacyCalls += 1;
        throw new Error("automatic refresh must use the combined operation");
      },
      analyzeAndFormat: async (source, version) => {
        combinedCalls += 1;
        const formatted = source.replace("=", " = ");
        return {
          analysis: validAnalysis(source, version),
          format: {
            version,
            status: "changed",
            text: formatted,
            edits: [],
            diagnostics: [],
          },
          formatted_analysis: validAnalysis(formatted, version),
        };
      },
    };
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });

    render(<App engine={engine} storage={storage} />);

    await screen.findByText("Valid document");
    expect(formattedPreviewSource()).toBe("answer = 42\n");
    expect(combinedCalls).toBe(1);
    expect(legacyCalls).toBe(0);
  });

  it("shows the core crate version that produced the deployed WebAssembly", async () => {
    render(
      <App
        coreVersion="0.3.0"
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );

    expect(await screen.findByText(/core v0\.3\.0/u)).not.toBeNull();
  });

  it("uses the editor as the flexible body of the source panel", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = playgroundStyles;
    document.head.append(stylesheet);
    onTestFinished(() => stylesheet.remove());

    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");

    const sourcePanel = screen.getByRole("region", {
      name: "Source document",
    });
    const editorStage = sourcePanel.querySelector<HTMLElement>(".editor-stage");
    const byteRail = sourcePanel.querySelector<HTMLElement>(".byte-rail");
    const sourceEditor =
      sourcePanel.querySelector<HTMLElement>(".source-editor");
    const railLine = sourcePanel.querySelector<HTMLElement>(".byte-rail li");
    const railButton = sourcePanel.querySelector<HTMLElement>(
      ".byte-rail button",
    );
    const codeMirror = sourcePanel.querySelector<HTMLElement>(".cm-editor");

    expect(getComputedStyle(sourcePanel).display).toBe("flex");
    expect(getComputedStyle(sourcePanel).flexDirection).toBe("column");
    expect(getComputedStyle(editorStage!).flexGrow).toBe("1");
    expect(getComputedStyle(byteRail!).height).toBe("100%");
    expect(getComputedStyle(sourceEditor!).height).toBe("100%");
    expect(
      getComputedStyle(editorStage!).getPropertyValue("--editor-line-height"),
    ).toBe("26px");
    expect(getComputedStyle(railLine!).height).toBe(
      "var(--editor-line-height)",
    );
    expect(getComputedStyle(railButton!).lineHeight).toBe(
      "var(--editor-line-height)",
    );
    expect(getComputedStyle(codeMirror!).lineHeight).toBe(
      "var(--editor-line-height)",
    );
  });

  it("uses a fixed viewport with configuration beside the workbench", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = playgroundStyles;
    document.head.append(stylesheet);
    onTestFinished(() => stylesheet.remove());

    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");

    const shell = document.querySelector<HTMLElement>(".workspace-shell");
    const controls = screen.getByRole("region", {
      name: "Playground controls",
    });
    const workspace = document.querySelector<HTMLElement>(".workspace-content");

    expect(document.querySelector(".hero")).toBeNull();
    expect(shell?.firstElementChild).toBe(controls);
    expect(shell?.lastElementChild).toBe(workspace);
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    expect(getComputedStyle(document.body).overflow).toBe("hidden");
    expect(getComputedStyle(shell!).display).toBe("grid");
    expect(getComputedStyle(controls).overflow).toBe("auto");
  });

  it("renders the format preview as a persistent read-only scrolling editor", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = playgroundStyles;
    document.head.append(stylesheet);
    onTestFinished(() => stylesheet.remove());
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        const key = source.split(/[ =]/u)[0] ?? "";
        return {
          ...validAnalysis(source, version),
          tokens: [{ kind: "key", range: range(0, key.length) }],
        };
      },
      format: async (source, version) => ({
        version,
        status: source.includes("=") ? "changed" : "unchanged",
        text: source.replace("=", " = "),
        edits: [],
        diagnostics: [],
      }),
    };

    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");

    const preview = screen.getByRole("textbox", {
      name: "Formatted TOML preview",
    });
    const previewView = EditorView.findFromDOM(preview);
    const source = screen.getByRole("textbox", { name: "TOML source" });
    const sourceView = EditorView.findFromDOM(source);

    expect(previewView?.state.readOnly).toBe(true);
    expect(preview.getAttribute("contenteditable")).toBe("false");
    expect(preview.tabIndex).toBe(0);
    preview.focus();
    expect(document.activeElement).toBe(preview);
    expect(getComputedStyle(previewView!.scrollDOM).overflow).toBe("auto");
    expect(getComputedStyle(sourceView!.scrollDOM).overflow).toBe("auto");
    expect(document.querySelector(".cm-token--key")).not.toBeNull();

    act(() => {
      sourceView?.dispatch({
        changes: {
          from: 0,
          to: sourceView.state.doc.length,
          insert: "fresh=true\n",
        },
      });
    });
    await waitFor(() => expect(formattedPreviewSource()).toBe("fresh = true\n"));
    expect(
      EditorView.findFromDOM(
        screen.getByRole("textbox", { name: "Formatted TOML preview" }),
      ),
    ).toBe(previewView);

    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    const diagnostics = screen.getByRole("tabpanel", { name: "Diagnostics" });
    expect(getComputedStyle(diagnostics).overflow).toBe("auto");
  });

  it("maps multibyte preview tokens onto UTF-16 editor decorations", () => {
    const source = 'emoji = "😀"\n名称 = true\n';
    const emoji = byteRangeOf(source, '"😀"');
    const chineseKey = byteRangeOf(source, "名称");

    const { container } = render(
      <PreviewEditor
        value={source}
        label="Formatted TOML preview"
        tokens={[
          {
            kind: "string",
            range: range(emoji.start, emoji.end),
          },
          {
            kind: "key",
            range: range(chineseKey.start, chineseKey.end),
          },
        ]}
      />,
    );

    const stringMark = container.querySelector<HTMLElement>(
      ".cm-token--string",
    );
    const keyMark = container.querySelector<HTMLElement>(".cm-token--key");
    expect(stringMark?.textContent).toBe('"😀"');
    expect(stringMark?.dataset.byteStart).toBe(String(emoji.start));
    expect(keyMark?.textContent).toBe("名称");
    expect(keyMark?.dataset.byteStart).toBe(String(chineseKey.start));
  });

  it("keeps document statistics inside the result header", async () => {
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");

    const output = screen.getByRole("region", { name: "Valid document" });
    const statistics = within(output).getByRole("region", {
      name: "Document statistics",
    });
    expect(statistics.closest("header")).toBe(output.querySelector("header"));
    expect(document.querySelector(".stat-rail")).toBeNull();
    expect(within(statistics).getAllByRole("term")).toHaveLength(6);
    expect(within(statistics).getAllByRole("definition")).toHaveLength(6);
  });

  it("keeps the GitHub mark non-interactive until a repository URL exists", async () => {
    const pending = render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");

    const placeholder = screen.getByRole("img", {
      name: "GitHub repository · coming soon",
    });
    expect(placeholder.closest(".masthead")).not.toBeNull();
    expect(placeholder.closest("a")).toBeNull();
    expect(placeholder.getAttribute("aria-disabled")).toBe("true");
    expect(placeholder.getAttribute("tabindex")).toBeNull();

    pending.unmount();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
        repositoryUrl="https://github.com/example-org/example-repo"
      />,
    );
    await screen.findByText("Valid document");

    const link = screen.getByRole("link", {
      name: "Open the TomlSmith GitHub repository in a new tab",
    });
    expect(link.closest(".masthead")).not.toBeNull();
    expect(link.getAttribute("href")).toBe(
      "https://github.com/example-org/example-repo",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(within(link).queryByRole("img")).toBeNull();
  });

  it("uses the browser language for a complete Simplified Chinese interface", async () => {
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["zh-CN"]}
      />,
    );

    await screen.findByText("文档有效");
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect(document.title).toBe(
      "TomlSmith Playground · 解析与格式化 TOML 1.0 / 1.1",
    );
    expect(
      screen.getByRole("heading", { name: "源文档" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^分析$/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /^格式化/u })).toBeNull();
    expect(
      screen.getByRole("tab", { name: "格式化预览" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "诊断" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "文档统计" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "GitHub 仓库 · 即将开放" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "格式化 TOML 预览" }),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: "诊断" }));
    expect(screen.getByText("未发现异常。")).toBeTruthy();
    expect(screen.getByText("文档符合所选版本的 TOML 规范。")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "词法单元" }));
    expect(screen.getByRole("columnheader", { name: "类型" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "字节范围" })).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "各行字节偏移量" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "TOML 源码" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", {
        name: "TOML 1.1 新增语法 — 转义序列与扩展内联表",
      }),
    ).toBeTruthy();
  });

  it("persists an accessible language choice and updates chrome without rebuilding the editor", async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    const engine = new RecordingEngine();
    const description = document.createElement("meta");
    description.name = "description";
    document.head.append(description);
    onTestFinished(() => description.remove());
    const first = render(
      <App
        engine={engine}
        storage={storage}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");
    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(screen.getByText("No issues found.")).toBeTruthy();
    expect(
      screen.getByText(
        "The document conforms to the selected TOML specification.",
      ),
    ).toBeTruthy();
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const editorView = EditorView.findFromDOM(editor);
    const analysisCount = engine.analyses.length;
    expect(document.querySelector(".execution-timing")?.textContent).toContain(
      "ANALYZE",
    );
    const chinese = screen.getByRole("button", {
      name: "Switch interface to Simplified Chinese",
    });
    const english = screen.getByRole("button", {
      name: "Switch interface to English",
    });

    expect(english.hasAttribute("lang")).toBe(false);
    expect(chinese.hasAttribute("lang")).toBe(false);
    expect(english.querySelector("span")?.lang).toBe("en");
    expect(chinese.querySelector("span")?.lang).toBe("zh-Hans");

    chinese.focus();
    await user.keyboard("{Enter}");

    await screen.findByText("文档有效");
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect(document.title).toBe(
      "TomlSmith Playground · 解析与格式化 TOML 1.0 / 1.1",
    );
    expect(description.content).toBe(
      "在浏览器中使用 TomlSmith 解析、诊断和格式化 TOML 1.0 与 1.1，并查看词法单元。",
    );
    expect(storage.getItem("tomlsmith.playground.locale.v1")).toBe("zh-Hans");
    expect(
      screen
        .getByRole("button", { name: "切换界面为简体中文" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      EditorView.findFromDOM(
        screen.getByRole("textbox", { name: "TOML 源码" }),
      ),
    ).toBe(editorView);
    expect(engine.analyses).toHaveLength(analysisCount);
    expect(document.querySelector(".execution-timing")?.textContent).toContain(
      "分析",
    );

    first.unmount();
    render(
      <App
        engine={new RecordingEngine()}
        storage={storage}
        preferredLanguages={["en-US"]}
      />,
    );

    await screen.findByText("文档有效");
    expect(document.documentElement.lang).toBe("zh-Hans");
  });

  it("retranslates an in-flight automatic refresh without restarting it", async () => {
    const user = userEvent.setup();
    const pending = deferred<AnalysisResult>();
    let analysisCalls = 0;
    const engine: PlaygroundEngine = {
      analyze: () => {
        analysisCalls += 1;
        return pending.promise;
      },
      format: async (_source, version) => ({
        version,
        status: "unchanged",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        preferredLanguages={["en"]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "Formatting and analyzing…",
      );
    });

    await user.click(
      screen.getByRole("button", {
        name: "Switch interface to Simplified Chinese",
      }),
    );

    expect(screen.getByText("正在加载引擎")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "正在格式化并分析…",
    );
    expect(analysisCalls).toBe(1);
    await act(async () => {
      pending.resolve(validAnalysis("answer = 42\n", "1.1"));
      await pending.promise;
    });
    expect(screen.getByText("文档有效")).toBeTruthy();
    expect(screen.getByText("分析完成，1 个键有效。")).toBeTruthy();
    expect(analysisCalls).toBe(1);
  });

  it("retranslates an in-flight formatter step without restarting it", async () => {
    const user = userEvent.setup();
    const pending = deferred<FormatResult>();
    const engine = new RecordingEngine();
    engine.format = () => pending.promise;
    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        preferredLanguages={["en"]}
      />,
    );
    await waitFor(() => {
      const status = screen.getByRole("status");
      expect(status.textContent).toContain(
        "Formatting and analyzing…",
      );
      expect(status.parentElement?.classList.contains("result-views")).toBe(
        true,
      );
    });
    await user.click(
      screen.getByRole("button", {
        name: "Switch interface to Simplified Chinese",
      }),
    );

    expect(screen.getByRole("status").textContent).toContain(
      "正在格式化并分析…",
    );
    expect(engine.analyses).toHaveLength(1);
    await act(async () => {
      pending.resolve({
        version: "1.1",
        status: "refused",
        text: "",
        edits: [],
        diagnostics: [],
      });
      await pending.promise;
    });
    expect(screen.getByText("拒绝格式化")).toBeTruthy();
    expect(screen.getByText("拒绝格式化，请解决列出的诊断。")).toBeTruthy();
    expect(engine.analyses).toHaveLength(1);
  });

  it("retranslates an already displayed operation error", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en"]}
        clipboard={{
          writeText: async () => {
            throw new Error("Clipboard permission denied");
          },
        }}
      />,
    );
    await screen.findByText("Valid document");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Copy failed",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Switch interface to Simplified Chinese",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("复制失败");
    expect(alert.textContent).toContain("Clipboard permission denied");
    expect(alert.textContent).toContain("请允许剪贴板访问");
    expect(screen.queryByText("Copy failed.")).toBeNull();
  });

  it("keeps a selected language active when storage writes are blocked", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new WriteRejectingStorage()}
        preferredLanguages={["en"]}
      />,
    );
    await screen.findByText("Valid document");

    await user.click(
      screen.getByRole("button", {
        name: "Switch interface to Simplified Chinese",
      }),
    );

    await screen.findByText("文档有效");
    expect(document.documentElement.lang).toBe("zh-Hans");
  });

  it("localizes diagnostics, coordinates, and operation feedback while preserving core messages", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["zh-Hans"]}
        clipboard={{
          writeText: async () => {
            throw new Error("Clipboard permission denied");
          },
        }}
      />,
    );
    await screen.findByText("文档有效");

    await user.selectOptions(screen.getByLabelText("示例文档"), "toml-1-1");
    await user.selectOptions(screen.getByLabelText("TOML 语法版本"), "1.0");

    await screen.findByText("发现问题");
    await user.click(screen.getByRole("tab", { name: "诊断" }));
    const diagnosticsView = within(
      screen.getByRole("tabpanel", { name: "诊断" }),
    );
    expect(diagnosticsView.getByText("错误")).toBeTruthy();
    expect(
      within(
        screen.getByRole("complementary", { name: "各行字节偏移量" }),
      ).getByText("错"),
    ).toBeTruthy();
    expect(
      diagnosticsView.getByText(/第 1 行，第 11 列 · 字节 10–12/u),
    ).toBeTruthy();
    expect(
      diagnosticsView.getByText("escape is only available in TOML 1.1"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /错误诊断：version\.toml-1\.1-syntax/u,
      }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "复制" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("复制失败");
    expect(alert.textContent).toContain("Clipboard permission denied");
    expect(alert.textContent).toContain("请允许剪贴板访问");
    expect(screen.getByText("发现问题")).toBeTruthy();
  });

  it("announces successful Chinese format, copy, and download operations", async () => {
    const user = userEvent.setup();
    const downloads: Array<{ name: string; text: string }> = [];
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["zh"]}
        clipboard={{ writeText: async () => undefined }}
        download={(file) => downloads.push(file)}
      />,
    );
    await screen.findByText("文档有效");

    const editor = screen.getByRole("textbox", { name: "TOML 源码" });
    fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });
    await screen.findByText("文档已格式化。");
    await user.click(screen.getByRole("button", { name: "复制" }));
    expect(screen.getByText("已复制 TOML 源码。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "下载" }));
    expect(screen.getByText("已下载 TOML 源码。")).toBeTruthy();
    expect(downloads).toEqual([
      { name: "tomlsmith-playground.toml", text: "answer = 42\n" },
    ]);
  });

  it("analyzes examples with the selected grammar and persists the session", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");

    await user.selectOptions(screen.getByLabelText("Example document"), "toml-1-1");
    await user.selectOptions(screen.getByLabelText("TOML grammar version"), "1.0");

    await screen.findByText("Issues found");
    expect(engine.analyses).toContainEqual({
      source: expect.stringContaining("\\e"),
      version: "1.0",
    });
    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(
      within(
        screen.getByRole("tabpanel", { name: "Diagnostics" }),
      ).getByText(/version\.toml-1\.1-syntax/u),
    ).toBeTruthy();
    expect(storage.getItem("tomlsmith.playground.session.v1")).toContain(
      '"version":"1.0"',
    );
  });

  it("formats, copies, and downloads the current document", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    const copied: string[] = [];
    const downloads: Array<{ name: string; text: string }> = [];
    render(
      <App
        engine={engine}
        storage={storage}
        clipboard={{ writeText: async (text) => void copied.push(text) }}
        download={(file) => downloads.push(file)}
      />,
    );
    await screen.findByText("Valid document");

    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const editorView = EditorView.findFromDOM(editor);
    expect(editorView).not.toBeNull();
    fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(formattedPreviewSource()).toContain(
        "answer = 42",
      );
    });
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    await user.click(screen.getByRole("button", { name: /download/i }));

    expect(copied).toEqual(["answer = 42\n"]);
    expect(downloads).toEqual([
      { name: "tomlsmith-playground.toml", text: "answer = 42\n" },
    ]);
    expect(EditorView.findFromDOM(editor)).toBe(editorView);
  });

  it("turns a WASM failure into an actionable alert", async () => {
    const engine: PlaygroundEngine = {
      analyze: async () => {
        throw new Error("WebAssembly unavailable");
      },
      format: async () => {
        throw new Error("WebAssembly unavailable");
      },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("WebAssembly unavailable");
    expect(alert.textContent).toContain("Reload");
    expect(alert.tabIndex).toBe(0);
  });

  it("reports clipboard rejection without replacing valid engine state", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        clipboard={{
          writeText: async () => {
            throw new Error("Clipboard permission denied");
          },
        }}
      />,
    );
    await screen.findByText("Valid document");

    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Copy failed");
    expect(alert.textContent).toContain("Clipboard permission denied");
    expect(alert.textContent).not.toContain("WebAssembly");
    expect(screen.getByText("Valid document")).toBeTruthy();
  });

  it("reports download failure without replacing valid engine state", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        download={() => {
          throw new Error("Browser blocked the download");
        }}
      />,
    );
    await screen.findByText("Valid document");

    await user.click(screen.getByRole("button", { name: /download/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Download failed");
    expect(alert.textContent).toContain("Browser blocked the download");
    expect(alert.textContent).not.toContain("WebAssembly");
    expect(screen.getByText("Valid document")).toBeTruthy();
  });

  it("implements the WAI-ARIA keyboard model for result tabs", async () => {
    const user = userEvent.setup();
    render(<App engine={new RecordingEngine()} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const preview = screen.getByRole("tab", { name: /format preview/i });
    const diagnostics = screen.getByRole("tab", { name: /diagnostics/i });
    const tokens = screen.getByRole("tab", { name: /^tokens$/i });

    preview.focus();
    await user.keyboard("{ArrowRight}");
    expect(diagnostics.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    expect(tokens.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}");
    expect(preview.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the selected result view when automatic formatting is refused", async () => {
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "broken =\n", version: "1.1" });
    engine.format = async (_source, version) => ({
      version,
      status: "refused",
      text: "",
      edits: [],
      diagnostics: [
        {
          code: "format.refused",
          severity: "error",
          message: "resolve syntax first",
          range: range(0, 1),
        },
      ],
    });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Format refused");
    const preview = screen.getByRole("tab", { name: "Format preview" });
    const diagnostics = screen.getByRole("tab", { name: "Diagnostics" });

    expect(preview.getAttribute("aria-selected")).toBe("true");
    expect(diagnostics.getAttribute("aria-selected")).toBe("false");
    expect(
      screen.getByText(
        "Format preview unavailable. Resolve the diagnostics to generate it.",
      ),
    ).toBeTruthy();
    expect(formattedPreviewSource()).not.toContain(
      "broken =",
    );
    expect(
      (screen.getByRole("button", { name: "Copy" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Download" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("keeps the selected result view when automatic analysis finds issues", async () => {
    const user = userEvent.setup();
    const engine: PlaygroundEngine = {
      analyze: async (source, version) =>
        source === "broken =\n"
          ? {
              ...validAnalysis(source, version),
              valid: false,
              diagnostics: [
                {
                  code: "parse.missing-value",
                  severity: "error",
                  message: "expected a value",
                  range: range(8, 8),
                },
              ],
            }
          : validAnalysis(source, version),
      format: async (_source, version) => ({
        version,
        status: "unchanged",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "broken =\n",
        },
      });
    });
    await screen.findByText("Refreshing results");
    const tokens = screen.getByRole("tab", { name: "Tokens" });
    const diagnostics = screen.getByRole("tab", { name: "Diagnostics" });

    await user.click(tokens);

    await screen.findByText("Issues found");
    expect(tokens.getAttribute("aria-selected")).toBe("true");
    expect(diagnostics.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(tokens);
  });

  it("refreshes stale results automatically and keeps tabs view-only", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer = 42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    const initialCalls = engine.analyses.length;
    const initialFormats = engine.formats.length;

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "answer = 43\n",
        },
      });
    });
    await screen.findByText("Refreshing results");

    await waitFor(() => {
      expect(engine.formats).toHaveLength(initialFormats + 1);
    });
    await screen.findByText("Valid document");
    expect(engine.analyses).toContainEqual({
      source: "answer = 43\n",
      version: "1.1",
    });
    expect(engine.analyses.length).toBeGreaterThan(initialCalls);
    const refreshedCalls = engine.analyses.length;
    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    await user.click(screen.getByRole("tab", { name: "Tokens" }));
    await user.click(screen.getByRole("tab", { name: "Format preview" }));
    expect(engine.analyses).toHaveLength(refreshedCalls);
    expect(engine.formats).toHaveLength(initialFormats + 1);
  });

  it("shows loading as soon as edited results become stale", async () => {
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer = 42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "answer = 43\n",
        },
      });
    });

    expect(
      screen
        .getByRole("region", { name: "Refreshing results" })
        .getAttribute("aria-busy"),
    ).toBe("true");
    expect(screen.getByRole("status").textContent).toBe(
      "Formatting and analyzing…",
    );
    expect(screen.queryByText(/pause typing/iu)).toBeNull();
  });

  it("coalesces diagnostics and tokens while one analysis is pending", async () => {
    const pending = deferred<AnalysisResult>();
    const analyses: Array<{ source: string; version: TomlVersion }> = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push({ source, version });
        return analyses.length === 1
          ? validAnalysis(source, version)
          : pending.promise;
      },
      format: async (_source, version) => ({
        version,
        status: "unchanged",
        text: _source,
        edits: [],
        diagnostics: [],
      }),
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "fresh = true\n",
        },
      });
    });
    await screen.findByText("Refreshing results");
    const diagnostics = screen.getByRole("tab", { name: "Diagnostics" });
    const tokens = screen.getByRole("tab", { name: "Tokens" });

    fireEvent.click(diagnostics);
    fireEvent.click(tokens);

    await waitFor(() => expect(analyses).toHaveLength(2));
    expect(tokens.getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      pending.resolve(validAnalysis("fresh = true\n", "1.1"));
      await pending.promise;
    });
    expect(tokens.getAttribute("aria-selected")).toBe("true");
    expect(analyses).toHaveLength(2);
  });

  it("keeps the latest selected result view while automatic preview finishes", async () => {
    const user = userEvent.setup();
    const pending = deferred<FormatResult>();
    const formatted: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => validAnalysis(source, version),
      format: (source, version) => {
        formatted.push(source);
        return source === "fresh = true\n"
          ? pending.promise
          : Promise.resolve({
              version,
              status: "unchanged",
              text: source,
              edits: [],
              diagnostics: [],
            });
      },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    const tokens = screen.getByRole("tab", { name: "Tokens" });

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "fresh = true\n",
        },
      });
    });
    await user.click(tokens);
    await waitFor(() => expect(formatted).toContain("fresh = true\n"));
    expect(tokens.getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      pending.resolve({
        version: "1.1",
        status: "changed",
        text: "answer = 42\n",
        edits: [],
        diagnostics: [],
      });
      await pending.promise;
    });

    await screen.findByText("Valid document");
    expect(tokens.getAttribute("aria-selected")).toBe("true");
  });

  it("publishes only the latest automatic refresh and its timing", async () => {
    const staleAnalysis = deferred<AnalysisResult>();
    const analyses: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push(source);
        if (source === "stale = true\n") {
          return staleAnalysis.promise;
        }
        return validAnalysis(source, version);
      },
      format: async (source, version) =>
        source === "latest=true\n"
          ? {
              version,
              status: "changed",
              text: "latest = true\n",
              edits: [],
              diagnostics: [],
            }
          : {
              version,
              status: "unchanged",
              text: source,
              edits: [],
              diagnostics: [],
            },
    };
    let reading = 0;
    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        now={() => ++reading}
      />,
    );
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "stale = true\n",
        },
      });
    });
    await waitFor(() => expect(analyses).toContain("stale = true\n"));
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "latest=true\n",
        },
      });
    });
    await waitFor(() => expect(analyses).toContain("latest = true\n"));
    await screen.findByText("Valid document");
    expect(formattedPreviewSource()).toBe(
      "latest = true\n",
    );
    const latestTiming = document.querySelector(
      ".execution-timing",
    )?.textContent;
    await act(async () => {
      staleAnalysis.resolve(validAnalysis("stale = true\n", "1.1"));
      await staleAnalysis.promise;
    });
    expect(document.querySelector(".execution-timing")?.textContent).toBe(
      latestTiming,
    );
    expect(formattedPreviewSource()).toBe(
      "latest = true\n",
    );
  });

  it("ignores a stale formatted-preview analysis after a newer edit", async () => {
    const stalePreview = deferred<AnalysisResult>();
    const analyses: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push(source);
        return source === "stale = true\n"
          ? stalePreview.promise
          : validAnalysis(source, version);
      },
      format: async (source, version) => {
        if (source === "stale=true\n") {
          return {
            version,
            status: "changed",
            text: "stale = true\n",
            edits: [],
            diagnostics: [],
          };
        }
        if (source === "latest=true\n") {
          return {
            version,
            status: "changed",
            text: "latest = true\n",
            edits: [],
            diagnostics: [],
          };
        }
        return {
          version,
          status: "unchanged",
          text: source,
          edits: [],
          diagnostics: [],
        };
      },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "stale=true\n",
        },
      });
    });
    await waitFor(() => expect(analyses).toContain("stale = true\n"));
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "latest=true\n",
        },
      });
    });
    await waitFor(() => expect(analyses).toContain("latest = true\n"));
    await screen.findByText("Valid document");
    const latestTiming = document.querySelector(
      ".execution-timing",
    )?.textContent;

    await act(async () => {
      stalePreview.resolve(validAnalysis("stale = true\n", "1.1"));
      await stalePreview.promise;
    });

    expect(formattedPreviewSource()).toBe(
      "latest = true\n",
    );
    expect(document.querySelector(".execution-timing")?.textContent).toBe(
      latestTiming,
    );
  });

  it("formats a preview without changing the editor or persisted source", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => {
      view?.dispatch({ selection: { anchor: 6 } });
      if (view !== null) {
        view.scrollDOM.scrollTop = 19;
        view.scrollDOM.scrollLeft = 7;
      }
    });
    const saved = storage.getItem("tomlsmith.playground.session.v1");
    const initialAnalysisCount = engine.analyses.length;
    const initialFormatCount = engine.formats.length;

    await user.click(screen.getByRole("tab", { name: "Format preview" }));

    expect(engine.formats).toHaveLength(initialFormatCount);
    expect(engine.analyses).toHaveLength(initialAnalysisCount);
    expect(formattedPreviewSource()).toBe(
      "answer = 42\n",
    );
    expect(engine.operations.slice(-2)).toEqual([
      "format:answer=42\n",
      "analyze:answer = 42\n",
    ]);
    expect(view?.state.doc.toString()).toBe("answer=42\n");
    expect(view?.state.selection.main.head).toBe(6);
    expect(view?.scrollDOM.scrollTop).toBe(19);
    expect(view?.scrollDOM.scrollLeft).toBe(7);
    expect(storage.getItem("tomlsmith.playground.session.v1")).toBe(saved);
  });

  it("debounces rapid edits into one latest automatic refresh", async () => {
    const formats: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => validAnalysis(source, version),
      format: async (source, version) => {
        formats.push(source);
        return {
          version,
          status: "changed",
          text: source.replace("=", " = "),
          edits: [],
          diagnostics: [],
        };
      },
    };
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const preview = screen.getByRole("tab", { name: "Format preview" });
    expect(formattedPreviewSource()).toBe(
      "answer = 42\n",
    );

    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => {
      for (const value of ["answer=43\n", "answer=44\n", "answer=45\n"]) {
        view?.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: value,
          },
        });
      }
    });

    await waitFor(() => {
      expect(formats).toEqual(["answer=42\n", "answer=45\n"]);
      expect(formattedPreviewSource()).toBe(
        "answer = 45\n",
      );
    });
    expect(preview.getAttribute("aria-selected")).toBe("true");
    expect(view?.state.doc.toString()).toBe("answer=45\n");
    expect(storage.getItem("tomlsmith.playground.session.v1")).toContain(
      '"source":"answer=45\\n"',
    );
  });

  it("reuses the working-copy analysis when formatting leaves the source unchanged", async () => {
    const analyses: string[] = [];
    const formats: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push(source);
        return validAnalysis(source, version);
      },
      format: async (source, version) => {
        formats.push(source);
        return {
          version,
          status: "unchanged",
          text: source,
          edits: [],
          diagnostics: [],
        };
      },
    };
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer = 42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");

    expect(analyses).toEqual(["answer = 42\n"]);
    expect(formats).toEqual(["answer = 42\n"]);
    expect(formattedPreviewSource()).toBe("answer = 42\n");
  });

  it("refreshes every result after editing without using result tabs as actions", async () => {
    const analyses: string[] = [];
    const formats: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push(source);
        const analysis = validAnalysis(source, version);
        return source === "answer=43\n"
          ? {
              ...analysis,
              diagnostics: [
                {
                  code: "lint.fresh-result",
                  severity: "warning",
                  message: "fresh working-copy analysis",
                  range: range(0, 6),
                },
              ],
            }
          : analysis;
      },
      format: async (source, version) => {
        formats.push(source);
        return {
          version,
          status: "changed",
          text:
            source === "answer=43\n" ? "answer = 43\n" : "answer = 42\n",
          edits: [],
          diagnostics: [],
        };
      },
    };
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const diagnostics = screen.getByRole("tab", { name: "Diagnostics" });
    await userEvent.click(diagnostics);

    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "answer=43\n",
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getAllByText("fresh working-copy analysis").length,
      ).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(formats.at(-1)).toBe("answer=43\n");
      expect(formattedPreviewSource()).toBe(
        "answer = 43\n",
      );
    });
    expect(diagnostics.getAttribute("aria-selected")).toBe("true");
    expect(
      analyses.filter((source) => source === "answer=43\n"),
    ).toHaveLength(1);
    expect(
      analyses.filter((source) => source === "answer = 43\n"),
    ).toHaveLength(1);
    expect(
      formats.filter((source) => source === "answer=43\n"),
    ).toHaveLength(1);

    const callCounts = { analyses: analyses.length, formats: formats.length };
    await userEvent.click(screen.getByRole("tab", { name: "Format preview" }));
    await userEvent.click(screen.getByRole("tab", { name: "Tokens" }));
    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(analyses).toHaveLength(callCounts.analyses);
    expect(formats).toHaveLength(callCounts.formats);
  });

  it("keeps the token ledger tied to the working copy after formatting a preview", async () => {
    const user = userEvent.setup();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "original=1\n", version: "1.1" });
    render(<App engine={new RecordingEngine()} storage={storage} />);
    await screen.findByText("Valid document");

    expect(formattedPreviewSource()).toBe(
      "answer = 42\n",
    );

    await user.click(screen.getByRole("tab", { name: "Tokens" }));
    const ledger = document.querySelector("#tokens-view");
    expect(ledger?.textContent).toContain("original");
    expect(ledger?.textContent).not.toContain("answer");
  });

  it("reuses a fresh format preview and invalidates it exactly", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer = 42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const preview = screen.getByRole("tab", { name: "Format preview" });
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();

    expect(engine.formats).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "Diagnostics" }));
    await user.click(preview);
    expect(engine.formats).toHaveLength(1);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "answer = 43\n",
        },
      });
    });
    await screen.findByText("Refreshing results");
    await waitFor(() => expect(engine.formats).toHaveLength(2));
    expect(engine.formats.at(-1)).toEqual({
      source: "answer = 43\n",
      version: "1.1",
    });

    await user.selectOptions(screen.getByLabelText("TOML grammar version"), "1.0");
    await screen.findByText("Valid document");
    await waitFor(() => expect(engine.formats).toHaveLength(3));
    expect(engine.formats.at(-1)).toEqual({
      source: "answer = 43\n",
      version: "1.0",
    });
  });

  it("copies and downloads the displayed format preview without persisting it", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    const copied: string[] = [];
    const downloads: Array<{ name: string; text: string }> = [];
    render(
      <App
        engine={engine}
        storage={storage}
        clipboard={{ writeText: async (text) => void copied.push(text) }}
        download={(file) => downloads.push(file)}
      />,
    );
    await screen.findByText("Valid document");
    await user.click(screen.getByRole("tab", { name: "Format preview" }));

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(copied).toEqual(["answer = 42\n"]);
    expect(downloads).toEqual([
      { name: "tomlsmith-playground.toml", text: "answer = 42\n" },
    ]);
    expect(storage.getItem("tomlsmith.playground.session.v1")).toContain(
      '"source":"answer=42\\n"',
    );
  });

  it("shows end-to-end elapsed time for the automatic full refresh", async () => {
    const readings = [10, 10.424];
    const now = vi.fn(() => readings.shift() ?? 10.424);
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        now={now}
      />,
    );

    await screen.findByText(/FORMAT \+ ANALYZE Δt 0\.42 ms/u);
    expect(
      document.querySelector(".execution-timing .visually-hidden")?.textContent,
    ).toBe("FORMAT + ANALYZE completed in 0.42 milliseconds");
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("labels a failed automatic preview analysis as the full pipeline", async () => {
    const readings = [20, 20.7];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        if (source === "formatted = true\n") {
          throw new Error("preview analysis failed");
        }
        return validAnalysis(source, version);
      },
      format: async (_source, version) => ({
        version,
        status: "changed",
        text: "formatted = true\n",
        edits: [],
        diagnostics: [],
      }),
    };
    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        now={() => readings.shift() ?? 20.7}
      />,
    );

    await screen.findByText("Engine unavailable");
    expect(document.querySelector(".execution-timing")?.textContent).toContain(
      "FORMAT + ANALYZE Δt 0.70 ms",
    );
  });

  it("routes editor shortcuts without rebuilding the editor", async () => {
    let refreshes = 0;
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => validAnalysis(source, version),
      format: async (source, version) => ({
        version,
        status: "unchanged",
        text: source,
        edits: [],
        diagnostics: [],
      }),
      analyzeAndFormat: async (source, version) => {
        refreshes += 1;
        const analysis = validAnalysis(source, version);
        return {
          analysis,
          format: {
            version,
            status: "unchanged",
            text: source,
            edits: [],
            diagnostics: [],
          },
          formatted_analysis: null,
        };
      },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    const initialRefreshes = refreshes;

    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
    await waitFor(() => expect(refreshes).toBe(initialRefreshes + 1));
    expect(EditorView.findFromDOM(editor)).toBe(view);
  });

  it("keeps working-copy analysis when explicit format is refused", async () => {
    const analyses: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        analyses.push(source);
        return validAnalysis(source, version);
      },
      format: async (source, version) =>
        source === "broken =\n"
          ? {
              version,
              status: "refused",
              text: "",
              edits: [],
              diagnostics: [
                {
                  code: "format.refused",
                  severity: "error",
                  message: "resolve syntax first",
                  range: range(8, 8),
                },
              ],
            }
          : {
              version,
              status: "unchanged",
              text: source,
              edits: [],
              diagnostics: [],
            },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "broken =\n",
        },
      });
      fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });
    });

    await screen.findByText("Format refused");
    expect(analyses).toContain("broken =\n");
    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(
      screen.getAllByText("resolve syntax first").length,
    ).toBeGreaterThan(0);
  });

  it("reports every merged diagnostic after explicit format is refused", async () => {
    const engine: PlaygroundEngine = {
      analyze: async (source, version) =>
        source === "broken =\n"
          ? {
              ...validAnalysis(source, version),
              valid: false,
              diagnostics: [
                {
                  code: "parse.missing-value",
                  severity: "error",
                  message: "expected a value",
                  range: range(8, 8),
                },
              ],
            }
          : validAnalysis(source, version),
      format: async (source, version) =>
        source === "broken =\n"
          ? {
              version,
              status: "refused",
              text: "",
              edits: [],
              diagnostics: [
                {
                  code: "format.refused",
                  severity: "error",
                  message: "resolve syntax first",
                  range: range(8, 8),
                },
              ],
            }
          : {
              version,
              status: "unchanged",
              text: source,
              edits: [],
              diagnostics: [],
            },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "broken =\n",
        },
      });
      fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });
    });

    await screen.findByText("Analysis complete. 2 issues found.");
    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    expect(screen.getAllByText("expected a value").length).toBeGreaterThan(0);
    expect(screen.getAllByText("resolve syntax first").length).toBeGreaterThan(0);
  });

  it("labels refusal analysis failures as the full pipeline", async () => {
    const readings = [0, 0.1, 10, 10.7];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        if (source === "broken =\n") {
          throw new Error("working analysis failed");
        }
        return validAnalysis(source, version);
      },
      format: async (source, version) =>
        source === "broken =\n"
          ? {
              version,
              status: "refused",
              text: "",
              edits: [],
              diagnostics: [],
            }
          : {
              version,
              status: "unchanged",
              text: source,
              edits: [],
              diagnostics: [],
            },
    };
    render(
      <App
        engine={engine}
        storage={new MemoryStorage()}
        now={() => readings.shift() ?? 10.7}
      />,
    );
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "broken =\n",
        },
      });
      fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });
    });

    await screen.findByText("Engine unavailable");
    expect(document.querySelector(".execution-timing")?.textContent).toContain(
      "FORMAT + ANALYZE Δt 0.70 ms",
    );
  });

  it("does not rerun the automatic pipeline after explicit format completes", async () => {
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer=42\n", version: "1.1" });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const analysesBefore = engine.analyses.length;
    const formatsBefore = engine.formats.length;
    const editor = screen.getByRole("textbox", { name: "TOML source" });

    fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });

    await screen.findByText("Formatted document.");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(engine.formats).toHaveLength(formatsBefore + 1);
    expect(engine.analyses).toHaveLength(analysesBefore + 1);
  });

  it("keeps the selected specimen after applying format", async () => {
    const user = userEvent.setup();
    render(
      <App
        engine={new RecordingEngine()}
        storage={new MemoryStorage()}
        preferredLanguages={["en-US"]}
      />,
    );
    await screen.findByText("Valid document");
    const specimen = screen.getByLabelText(
      "Example document",
    ) as HTMLSelectElement;
    await user.selectOptions(specimen, "toml-1-0");
    await screen.findByText("Valid document");
    expect(specimen.value).toBe("toml-1-0");

    const editor = screen.getByRole("textbox", { name: "TOML source" });
    fireEvent.keyDown(editor, { key: "f", metaKey: true, shiftKey: true });

    await screen.findByText("Formatted document.");
    expect(specimen.value).toBe("toml-1-0");

    const view = EditorView.findFromDOM(editor);
    act(() => {
      view?.dispatch({
        changes: { from: view.state.doc.length, insert: " " },
      });
    });
    expect(specimen.value).toBe("");
  });

  it("uses Tab and Shift+Tab to indent and outdent the current line", async () => {
    const storage = new MemoryStorage();
    saveSession(storage, { source: "answer = 42\n", version: "1.1" });
    render(<App engine={new RecordingEngine()} storage={storage} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    act(() => view?.dispatch({ selection: { anchor: 0 } }));

    expect(fireEvent.keyDown(editor, { key: "Tab", keyCode: 9 })).toBe(false);
    expect(view?.state.doc.toString()).toBe("  answer = 42\n");

    expect(
      fireEvent.keyDown(editor, { key: "Tab", keyCode: 9, shiftKey: true }),
    ).toBe(false);
    expect(view?.state.doc.toString()).toBe("answer = 42\n");

    fireEvent.keyDown(editor, { key: "Escape", keyCode: 27 });
    expect(fireEvent.keyDown(editor, { key: "Tab", keyCode: 9 })).toBe(true);
    expect(view?.state.doc.toString()).toBe("answer = 42\n");
  });

  it("keeps one EditorView while edits persist with Unicode coordinates", async () => {
    const user = userEvent.setup();
    const engine = new RecordingEngine();
    const storage = new MemoryStorage();
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Valid document");
    const content = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(content);
    expect(view).not.toBeNull();
    expect(content.classList.contains("cm-lineWrapping")).toBe(false);

    const skipLink = screen.getByRole("link", { name: "Skip to TOML source" });
    skipLink.focus();
    fireEvent.click(skipLink);
    expect(document.activeElement).toBe(content);
    skipLink.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(content);

    act(() => {
      view?.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "😀x" },
        selection: { anchor: 2 },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/BYTE 00000004 · LN 1 · COL 2/u)).toBeTruthy();
    });
    expect(storage.getItem("tomlsmith.playground.session.v1")).toContain("😀x");

    fireEvent.keyDown(content, { key: "Enter", metaKey: true });
    await screen.findByText("Valid document");
    expect(EditorView.findFromDOM(content)).toBe(view);
  });

  it("moves the cursor from the byte rail without scrolling the page", async () => {
    const source = `${Array.from(
      { length: 40 },
      (_, index) => `line_${String(index + 1).padStart(2, "0")} = ${index + 1}`,
    ).join("\n")}\n`;
    const storage = new MemoryStorage();
    saveSession(storage, { source, version: "1.1" });
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const nativeFocus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function focus(
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (
        this.classList.contains("cm-content") &&
        options?.preventScroll !== true
      ) {
        document.documentElement.scrollTop = 900;
      }
      nativeFocus.call(this, options);
    });
    onTestFinished(() => {
      document.documentElement.scrollTop = 0;
    });
    render(<App engine={new RecordingEngine()} storage={storage} />);
    await screen.findByText("Valid document");
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    document.documentElement.scrollTop = 137;

    await userEvent.click(
      screen.getByRole("button", { name: /^Line 5, byte /u }),
    );

    await waitFor(() => {
      expect(view?.state.selection.main.head).toBe(source.indexOf("line_05"));
    });
    expect(document.activeElement).toBe(editor);
    expect(document.documentElement.scrollTop).toBe(137);
    expect(view?.scrollDOM.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows line diagnostics from the byte rail on hover and focus", async () => {
    const user = userEvent.setup();
    const source = "alpha =\nbeta =\n";
    const storage = new MemoryStorage();
    saveSession(storage, { source, version: "1.1" });
    const engine: PlaygroundEngine = {
      analyze: async (_source, version) => ({
        ...validAnalysis(source, version),
        valid: false,
        diagnostics: [
          {
            code: "parse.missing-value",
            severity: "error",
            message: "expected a value",
            range: range(7, 7),
          },
          {
            code: "parse.unexpected-token",
            severity: "warning",
            message: "remove the trailing token",
            range: range(6, 7),
          },
        ],
      }),
      format: async (_source, version) => ({
        version,
        status: "refused",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Issues found");
    const line = screen.getByRole("button", {
      name: /^Line 1, byte 0, 2 diagnostics, highest severity error$/u,
    });

    expect(line.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.hover(line);
    const hovered = screen.getByRole("tooltip");
    expect(hovered.textContent).toContain("parse.missing-value");
    expect(hovered.textContent).toContain("expected a value");
    expect(hovered.textContent).toContain("parse.unexpected-token");
    await user.hover(hovered);
    expect(screen.getByRole("tooltip")).toBe(hovered);
    await user.unhover(hovered);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => line.focus());
    expect(screen.getByRole("tooltip").textContent).toContain(
      "expected a value",
    );
    fireEvent.keyDown(line, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(line);
  });

  it("reveals a far diagnostic inside the editor without scrolling the page", async () => {
    const lines = Array.from(
      { length: 80 },
      (_, index) => `line_${String(index + 1).padStart(2, "0")} = ${index + 1}`,
    );
    lines[69] = `long_target = "${"x".repeat(300)}BAD"`;
    const source = `${lines.join("\n")}\n`;
    const offset = source.indexOf("BAD");
    const storage = new MemoryStorage();
    saveSession(storage, { source, version: "1.1" });
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const engine: PlaygroundEngine = {
      analyze: async (_source, version) => ({
        ...validAnalysis(source, version),
        valid: false,
        diagnostics: [
          {
            code: "test.line-70",
            severity: "error",
            message: "jump target",
            range: {
              start: offset,
              end: offset + "BAD".length,
              line: 70,
              column: 316,
              end_line: 70,
              end_column: 319,
            },
          },
        ],
      }),
      format: async (_source, version) => ({
        version,
        status: "refused",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    onTestFinished(() => {
      document.documentElement.scrollTop = 0;
    });
    render(<App engine={engine} storage={storage} />);
    await screen.findByText("Issues found");
    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));
    const editor = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(editor);
    expect(view).not.toBeNull();
    Object.defineProperty(view?.scrollDOM, "clientWidth", {
      configurable: true,
      value: 240,
    });
    document.documentElement.scrollTop = 211;

    await userEvent.click(
      screen.getByRole("button", {
        name: /error diagnostic: test\.line-70/u,
      }),
    );

    await waitFor(() => {
      expect(view?.state.selection.main.head).toBe(offset);
      expect(view?.scrollDOM.scrollTop).toBeGreaterThan(0);
      expect(view?.scrollDOM.scrollLeft).toBeGreaterThan(0);
    });
    expect(document.activeElement).toBe(editor);
    expect(document.documentElement.scrollTop).toBe(211);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("renders an exact CodeMirror marker for a zero-width diagnostic", async () => {
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => {
        const offset = new TextEncoder().encode(source).length;
        return {
          ...validAnalysis(source, version),
          valid: false,
          diagnostics: [
            {
              code: "parse.unclosed-table-header",
              severity: "error",
              message: "table header is missing a closing bracket",
              range: range(offset, offset),
            },
          ],
        };
      },
      format: async (_source, version) => ({
        version,
        status: "refused",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Issues found");
    await userEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));

    await waitFor(() => {
      expect(document.querySelector(".cm-diagnostic-pin--error")).not.toBeNull();
    });
    expect(
      within(
        screen.getByRole("tabpanel", { name: "Diagnostics" }),
      ).getByText("ERROR"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /error diagnostic: parse\.unclosed-table-header/u,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /^line \d+, byte \d+, error diagnostic$/iu,
      }),
    ).toBeTruthy();
  });

  it("mounts and analyzes when the localStorage getter is blocked", async () => {
    const host = Object.defineProperty({}, "localStorage", {
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    }) as { readonly localStorage: Storage };
    const engine = new RecordingEngine();

    render(
      <App
        engine={engine}
        storage={resolveBrowserStorage(host)}
        preferredLanguages={["zh-CN"]}
      />,
    );

    await screen.findByText("文档有效");
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect(engine.analyses).toHaveLength(2);
    expect(engine.formats).toHaveLength(1);
  });

  it("invalidates an in-flight analysis when the source is edited", async () => {
    const pending = deferred<AnalysisResult>();
    const engine: PlaygroundEngine = {
      analyze: () => pending.promise,
      format: async (_source, version) => ({
        version,
        status: "unchanged",
        text: "",
        edits: [],
        diagnostics: [],
      }),
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    const content = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(content);
    expect(view).not.toBeNull();

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "fresh = true\n",
        },
      });
    });
    await screen.findByText("Refreshing results");
    expect(document.querySelector(".execution-timing")).toBeNull();
    await act(async () => {
      pending.resolve(validAnalysis("stale = true\n", "1.1"));
      await pending.promise;
    });

    expect(screen.getByText("Refreshing results")).toBeTruthy();
    expect(screen.queryByText("Valid document")).toBeNull();
    expect(document.querySelector(".execution-timing")).toBeNull();
  });

  it("ignores a stale formatter refusal from a superseded automatic refresh", async () => {
    const pending = deferred<FormatResult>();
    const formats: string[] = [];
    const engine: PlaygroundEngine = {
      analyze: async (source, version) => validAnalysis(source, version),
      format: (source, version) => {
        formats.push(source);
        if (source === "stale = true\n") {
          return pending.promise;
        }
        return Promise.resolve({
          version,
          status: source === "latest=true\n" ? "changed" : "unchanged",
          text: source === "latest=true\n" ? "latest = true\n" : source,
          edits: [],
          diagnostics: [],
        });
      },
    };
    render(<App engine={engine} storage={new MemoryStorage()} />);
    await screen.findByText("Valid document");
    const content = screen.getByRole("textbox", { name: "TOML source" });
    const view = EditorView.findFromDOM(content);
    expect(view).not.toBeNull();

    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "stale = true\n",
        },
      });
    });
    await waitFor(() => expect(formats).toContain("stale = true\n"));
    act(() => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "latest=true\n",
        },
      });
    });
    await waitFor(() => expect(formats).toContain("latest=true\n"));
    await screen.findByText("Valid document");
    expect(formattedPreviewSource()).toBe(
      "latest = true\n",
    );
    const latestTiming = document.querySelector(
      ".execution-timing",
    )?.textContent;
    await act(async () => {
      pending.resolve({
        version: "1.1",
        status: "refused",
        text: "",
        edits: [],
        diagnostics: [
          {
            code: "stale.format",
            severity: "error",
            message: "stale refusal",
            range: range(0, 1),
          },
        ],
      });
      await pending.promise;
    });

    expect(screen.getByText("Valid document")).toBeTruthy();
    expect(screen.queryByText("Format refused")).toBeNull();
    expect(screen.queryByText("stale refusal")).toBeNull();
    expect(document.querySelector(".execution-timing")?.textContent).toBe(
      latestTiming,
    );
    expect(formattedPreviewSource()).toBe(
      "latest = true\n",
    );
  });
});

function formattedPreviewSource(): string {
  const host = document.querySelector<HTMLElement>("[data-preview-editor]");
  const content = host?.querySelector<HTMLElement>(".cm-content");
  return content === null || content === undefined
    ? ""
    : (EditorView.findFromDOM(content)?.state.doc.toString() ?? "");
}

class RecordingEngine implements PlaygroundEngine {
  readonly analyses: Array<{ source: string; version: TomlVersion }> = [];
  readonly formats: Array<{ source: string; version: TomlVersion }> = [];
  readonly operations: string[] = [];

  async analyze(source: string, version: TomlVersion): Promise<AnalysisResult> {
    this.analyses.push({ source, version });
    this.operations.push(`analyze:${source}`);
    const invalid = version === "1.0" && source.includes("\\e");
    const key = source.split(/[ =]/u)[0] ?? "";
    return {
      version,
      valid: !invalid,
      diagnostics: invalid
        ? [
            {
              code: "version.toml-1.1-syntax",
              severity: "error",
              message: "escape is only available in TOML 1.1",
              range: range(10, 12),
            },
          ]
        : [],
      tokens: [{ kind: "key", range: range(0, key.length) }],
      stats: {
        bytes: new TextEncoder().encode(source).length,
        lines: source.split("\n").length,
        keys: 1,
        tables: 0,
        array_tables: 0,
        comments: 0,
        tokens: 1,
      },
    };
  }

  async format(source: string, version: TomlVersion): Promise<FormatResult> {
    this.formats.push({ source, version });
    this.operations.push(`format:${source}`);
    return {
      version,
      status: "changed",
      text: "answer = 42\n",
      edits: [],
      diagnostics: [],
    };
  }
}

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

class WriteRejectingStorage implements Storage {
  get length(): number {
    return 0;
  }
  clear(): void {}
  getItem(): string | null {
    return null;
  }
  key(): string | null {
    return null;
  }
  removeItem(): void {}
  setItem(): void {
    throw new DOMException("Storage write blocked", "SecurityError");
  }
}

function range(start: number, end: number) {
  return {
    start,
    end,
    line: 1,
    column: start + 1,
    end_line: 1,
    end_column: end + 1,
  };
}

function byteRangeOf(source: string, fragment: string) {
  const utf16Start = source.indexOf(fragment);
  if (utf16Start < 0) {
    throw new Error(`Fragment not found: ${fragment}`);
  }
  const encoder = new TextEncoder();
  const start = encoder.encode(source.slice(0, utf16Start)).length;
  return {
    start,
    end: start + encoder.encode(fragment).length,
  };
}

function validAnalysis(
  source: string,
  version: TomlVersion,
): AnalysisResult {
  return {
    version,
    valid: true,
    diagnostics: [],
    tokens: [],
    stats: {
      bytes: new TextEncoder().encode(source).length,
      lines: source.split("\n").length,
      keys: 1,
      tables: 0,
      array_tables: 0,
      comments: 0,
      tokens: 0,
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
