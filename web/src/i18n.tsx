import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Diagnostic, TokenSpan } from "./contracts";
import type { PlaygroundExampleId } from "./examples";
import type { TomlVersion } from "./session";

export type Locale = "en" | "zh-Hans";

export interface PlaygroundCopy {
  execution: {
    analyze: string;
    format: string;
    formatAnalyze: string;
    elapsed(label: string, duration: string): string;
  };
  status: {
    loadingLabel: string;
    loadingDetail: string;
    refreshingLabel: string;
    refreshingDetail: string;
    applyingFormatLabel: string;
    applyingFormatDetail: string;
    validLabel: string;
    issuesLabel: string;
    analysisDetail(version: TomlVersion): string;
    formatRefusedLabel: string;
    formatRefusedDetail: string;
    engineUnavailableLabel: string;
    engineUnavailableDetail: string;
  };
  announcements: {
    analyzing: string;
    analysisValid(keys: number): string;
    analysisIssues(count: number): string;
    formatting: string;
    formatRefused: string;
    formatted: string;
    formatUnchanged: string;
    copied: string;
    downloaded: string;
    engineError(message: string): string;
    actionFailure(title: string, message: string): string;
  };
  errors: {
    engineTitle: string;
    engineHint: string;
    copyUnavailableTitle: string;
    copyUnavailableMessage: string;
    copyUnavailableHint: string;
    copyFailedTitle: string;
    copyFailedHint: string;
    downloadFailedTitle: string;
    downloadFailedHint: string;
  };
}

interface Messages {
  document: {
    title: string;
    description: string;
  };
  app: {
    skipToSource: string;
    homeLabel: string;
    runtime: string;
    runtimeCompact: string;
    repositoryLabel: string;
    repositoryPendingLabel: string;
    footerCore: string;
    footerPrivacy: string;
  };
  language: {
    groupLabel: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
  controls: {
    regionLabel: string;
    sectionLabel: string;
    title: string;
    automaticPipeline: string;
    grammar: string;
    grammarLabel: string;
    specimen: string;
    exampleLabel: string;
    workingCopy: string;
    reset: string;
    examples: Record<PlaygroundExampleId, { label: string; note: string }>;
  };
  workbench: {
    regionLabel: string;
    inputIndex: string;
    sourceTitle: string;
    byte: string;
    lineShort: string;
    columnShort: string;
    byteRailFooter: string;
    locallySaved: string;
    outputIndex: string;
    copy: string;
    download: string;
    loadingFallback: string;
  };
  byteRail: {
    label: string;
    lineLabel(
      line: number,
      byte: number,
      severity: Diagnostic["severity"] | null,
      diagnosticCount: number,
    ): string;
  };
  editor: {
    sourceLabel: string;
    previewLabel: string;
  };
  results: {
    viewsLabel: string;
    preview: string;
    previewPending: string;
    previewRefused: string;
    previewUnavailable: string;
    diagnostics: string;
    tokens: string;
  };
  diagnostics: {
    emptyTitle: string;
    emptyDetail: string;
    severity: Record<Diagnostic["severity"], string>;
    itemLabel(diagnostic: Diagnostic): string;
    location(diagnostic: Diagnostic): string;
  };
  tokenLedger: {
    empty: string;
    kind: string;
    bytes: string;
    lexeme: string;
    tokenKinds: Record<TokenSpan["kind"], string>;
  };
  stats: {
    regionLabel: string;
    bytes: string;
    lines: string;
    keys: string;
    tables: string;
    tokens: string;
    diagnostics: string;
  };
  playground: PlaygroundCopy;
}

const EN_MESSAGES: Messages = {
  document: {
    title: "TomlSmith Playground · Parse and format TOML 1.0 / 1.1",
    description:
      "Explore TOML 1.0 and 1.1 with TomlSmith parsing, diagnostics, tokens, and formatting, entirely in your browser.",
  },
  app: {
    skipToSource: "Skip to TOML source",
    homeLabel: "TomlSmith Playground home",
    runtime: "WASM · LOCAL ONLY",
    runtimeCompact: "LOCAL",
    repositoryLabel: "Open the TomlSmith GitHub repository in a new tab",
    repositoryPendingLabel: "GitHub repository · coming soon",
    footerCore: "TomlSmith language core · MIT",
    footerPrivacy: "Nothing uploaded. Nothing inferred.",
  },
  language: {
    groupLabel: "Interface language",
    english: "EN",
    chinese: "中文",
    switchToEnglish: "Switch interface to English",
    switchToChinese: "Switch interface to Simplified Chinese",
  },
  controls: {
    regionLabel: "Playground controls",
    sectionLabel: "CONFIG / TOML",
    title: "Configuration",
    automaticPipeline: "Live format + analysis",
    grammar: "Grammar",
    grammarLabel: "TOML grammar version",
    specimen: "Specimen",
    exampleLabel: "Example document",
    workingCopy: "Working copy — locally persisted source",
    reset: "Reset",
    examples: {
      workspace: {
        label: "Workspace manifest",
        note: "Nested tables and arrays of tables",
      },
      "toml-1-0": {
        label: "TOML 1.0 baseline",
        note: "Portable primitives and dotted keys",
      },
      "toml-1-1": {
        label: "TOML 1.1 additions",
        note: "Escape sequences and expanded inline tables",
      },
      diagnostics: {
        label: "Diagnostic specimen",
        note: "Conflicting declarations and an invalid array",
      },
    },
  },
  workbench: {
    regionLabel: "TOML source and result views",
    inputIndex: "INPUT / UTF-8",
    sourceTitle: "Source document",
    byte: "BYTE",
    lineShort: "LN",
    columnShort: "COL",
    byteRailFooter: "UTF-8 byte rail",
    locallySaved: "Saved locally as you type",
    outputIndex: "OUTPUT / CORE",
    copy: "Copy",
    download: "Download",
    loadingFallback: "Analyzing UTF-8 bytes…",
  },
  byteRail: {
    label: "Line byte offsets",
    lineLabel(line, byte, severity, diagnosticCount) {
      const issue =
        severity === null
          ? ""
          : diagnosticCount === 1
            ? `, ${severity} diagnostic`
            : `, ${diagnosticCount} diagnostics, highest severity ${severity}`;
      return `Line ${line}, byte ${byte}${issue}`;
    },
  },
  editor: {
    sourceLabel: "TOML source",
    previewLabel: "Formatted TOML preview",
  },
  results: {
    viewsLabel: "Result views",
    preview: "Format preview",
    previewPending: "Preparing format preview…",
    previewRefused:
      "Format preview unavailable. Resolve the diagnostics to generate it.",
    previewUnavailable:
      "Format preview unavailable while the engine is offline.",
    diagnostics: "Diagnostics",
    tokens: "Tokens",
  },
  diagnostics: {
    emptyTitle: "No issues found.",
    emptyDetail: "The document conforms to the selected TOML specification.",
    severity: { error: "ERROR", warning: "WARNING" },
    itemLabel(diagnostic) {
      return `${diagnostic.severity} diagnostic: ${diagnostic.code}. ${diagnostic.message}. Line ${diagnostic.range.line}, column ${diagnostic.range.column}, bytes ${diagnostic.range.start} to ${diagnostic.range.end}`;
    },
    location(diagnostic) {
      return `Line ${diagnostic.range.line}, column ${diagnostic.range.column} · bytes ${diagnostic.range.start}–${diagnostic.range.end}`;
    },
  },
  tokenLedger: {
    empty: "No classified tokens yet.",
    kind: "Kind",
    bytes: "Bytes",
    lexeme: "Lexeme",
    tokenKinds: {
      key: "Key",
      table: "Table",
      string: "String",
      number: "Number",
      boolean: "Boolean",
      datetime: "Date/time",
      comment: "Comment",
      punctuation: "Punctuation",
      invalid: "Invalid",
    },
  },
  stats: {
    regionLabel: "Document statistics",
    bytes: "UTF-8 bytes",
    lines: "Lines",
    keys: "Keys",
    tables: "Tables",
    tokens: "Tokens",
    diagnostics: "Diagnostics",
  },
  playground: {
    execution: {
      analyze: "ANALYZE",
      format: "FORMAT",
      formatAnalyze: "FORMAT + ANALYZE",
      elapsed: (label, duration) =>
        `${label} completed in ${duration} milliseconds`,
    },
    status: {
      loadingLabel: "Loading engine",
      loadingDetail: "Preparing parser and formatter",
      refreshingLabel: "Refreshing results",
      refreshingDetail: "Formatting and analyzing your changes",
      applyingFormatLabel: "Applying format",
      applyingFormatDetail: "Refreshing analysis and preview",
      validLabel: "Valid document",
      issuesLabel: "Issues found",
      analysisDetail: (version) => `TOML ${version}`,
      formatRefusedLabel: "Format refused",
      formatRefusedDetail: "Resolve diagnostics first",
      engineUnavailableLabel: "Engine unavailable",
      engineUnavailableDetail: "Reload after checking WebAssembly support",
    },
    announcements: {
      analyzing: "Analyzing UTF-8 bytes…",
      analysisValid: (keys) => `Analysis complete. ${keys} keys are valid.`,
      analysisIssues: (count) =>
        `Analysis complete. ${count} issues found.`,
      formatting: "Formatting and analyzing…",
      formatRefused: "Formatting refused. Resolve the listed diagnostics.",
      formatted: "Formatted document.",
      formatUnchanged: "Document already matches the formatter.",
      copied: "Copied TOML source.",
      downloaded: "Downloaded TOML source.",
      engineError: (message) => `Engine error: ${message}`,
      actionFailure: (title, message) => `${title} ${message}`,
    },
    errors: {
      engineTitle: "Engine could not start.",
      engineHint: "Reload the page after checking that WebAssembly is enabled.",
      copyUnavailableTitle: "Copy unavailable.",
      copyUnavailableMessage: "Clipboard access is unavailable.",
      copyUnavailableHint: "Select the source and copy it manually.",
      copyFailedTitle: "Copy failed.",
      copyFailedHint:
        "Allow clipboard access or select and copy the source manually.",
      downloadFailedTitle: "Download failed.",
      downloadFailedHint: "Check browser download permissions and try again.",
    },
  },
};

const ZH_HANS_MESSAGES: Messages = {
  document: {
    title: "TomlSmith Playground · 解析与格式化 TOML 1.0 / 1.1",
    description:
      "在浏览器中使用 TomlSmith 解析、诊断和格式化 TOML 1.0 与 1.1，并查看词法单元。",
  },
  app: {
    skipToSource: "跳转到 TOML 源码",
    homeLabel: "TomlSmith Playground 首页",
    runtime: "WASM · 仅在本地运行",
    runtimeCompact: "本地",
    repositoryLabel: "在新标签页打开 TomlSmith GitHub 仓库",
    repositoryPendingLabel: "GitHub 仓库 · 即将开放",
    footerCore: "TomlSmith 语言核心 · MIT",
    footerPrivacy: "不上传内容，不推断版本。",
  },
  language: {
    groupLabel: "界面语言",
    english: "EN",
    chinese: "中文",
    switchToEnglish: "切换界面为英文",
    switchToChinese: "切换界面为简体中文",
  },
  controls: {
    regionLabel: "Playground 控制栏",
    sectionLabel: "配置 / TOML",
    title: "配置",
    automaticPipeline: "实时格式化＋分析",
    grammar: "语法",
    grammarLabel: "TOML 语法版本",
    specimen: "示例",
    exampleLabel: "示例文档",
    workingCopy: "工作副本 — 源码已保存在本地",
    reset: "重置",
    examples: {
      workspace: {
        label: "工作区清单",
        note: "嵌套表与表数组",
      },
      "toml-1-0": {
        label: "TOML 1.0 基线",
        note: "可移植的基础值与点分键",
      },
      "toml-1-1": {
        label: "TOML 1.1 新增语法",
        note: "转义序列与扩展内联表",
      },
      diagnostics: {
        label: "诊断示例",
        note: "冲突声明与无效数组",
      },
    },
  },
  workbench: {
    regionLabel: "TOML 源码与结果视图",
    inputIndex: "输入 / UTF-8",
    sourceTitle: "源文档",
    byte: "字节",
    lineShort: "行",
    columnShort: "列",
    byteRailFooter: "UTF-8 字节刻度轨",
    locallySaved: "输入时自动保存在本地",
    outputIndex: "输出 / 核心",
    copy: "复制",
    download: "下载",
    loadingFallback: "正在分析 UTF-8 字节…",
  },
  byteRail: {
    label: "各行字节偏移量",
    lineLabel(line, byte, severity, diagnosticCount) {
      const issue =
        severity === null
          ? ""
          : diagnosticCount === 1
            ? `，${severity === "error" ? "错误" : "警告"}诊断`
            : `，${diagnosticCount} 条诊断，最高严重级别为${
                severity === "error" ? "错误" : "警告"
              }`;
      return `第 ${line} 行，字节 ${byte}${issue}`;
    },
  },
  editor: {
    sourceLabel: "TOML 源码",
    previewLabel: "格式化 TOML 预览",
  },
  results: {
    viewsLabel: "结果视图",
    preview: "格式化预览",
    previewPending: "正在准备格式化预览…",
    previewRefused: "无法生成格式化预览，请先解决诊断问题。",
    previewUnavailable: "引擎当前不可用，无法生成格式化预览。",
    diagnostics: "诊断",
    tokens: "词法单元",
  },
  diagnostics: {
    emptyTitle: "未发现异常。",
    emptyDetail: "文档符合所选版本的 TOML 规范。",
    severity: { error: "错误", warning: "警告" },
    itemLabel(diagnostic) {
      const severity = diagnostic.severity === "error" ? "错误" : "警告";
      return `${severity}诊断：${diagnostic.code}。${diagnostic.message}。第 ${diagnostic.range.line} 行，第 ${diagnostic.range.column} 列，字节 ${diagnostic.range.start} 到 ${diagnostic.range.end}`;
    },
    location(diagnostic) {
      return `第 ${diagnostic.range.line} 行，第 ${diagnostic.range.column} 列 · 字节 ${diagnostic.range.start}–${diagnostic.range.end}`;
    },
  },
  tokenLedger: {
    empty: "尚无已分类的词法单元。",
    kind: "类型",
    bytes: "字节范围",
    lexeme: "词素",
    tokenKinds: {
      key: "键",
      table: "表",
      string: "字符串",
      number: "数字",
      boolean: "布尔值",
      datetime: "日期/时间",
      comment: "注释",
      punctuation: "标点",
      invalid: "无效",
    },
  },
  stats: {
    regionLabel: "文档统计",
    bytes: "UTF-8 字节",
    lines: "行",
    keys: "键",
    tables: "表",
    tokens: "词法单元",
    diagnostics: "诊断",
  },
  playground: {
    execution: {
      analyze: "分析",
      format: "格式化",
      formatAnalyze: "格式化＋分析",
      elapsed: (label, duration) => `${label}完成，用时 ${duration} 毫秒`,
    },
    status: {
      loadingLabel: "正在加载引擎",
      loadingDetail: "正在准备解析器和格式化器",
      refreshingLabel: "正在刷新结果",
      refreshingDetail: "正在格式化并分析本次修改",
      applyingFormatLabel: "正在应用格式化",
      applyingFormatDetail: "正在刷新分析与预览",
      validLabel: "文档有效",
      issuesLabel: "发现问题",
      analysisDetail: (version) => `TOML ${version}`,
      formatRefusedLabel: "拒绝格式化",
      formatRefusedDetail: "请先解决诊断",
      engineUnavailableLabel: "引擎不可用",
      engineUnavailableDetail: "检查 WebAssembly 支持后重新加载",
    },
    announcements: {
      analyzing: "正在分析 UTF-8 字节…",
      analysisValid: (keys) => `分析完成，${keys} 个键有效。`,
      analysisIssues: (count) => `分析完成，发现 ${count} 个问题。`,
      formatting: "正在格式化并分析…",
      formatRefused: "拒绝格式化，请解决列出的诊断。",
      formatted: "文档已格式化。",
      formatUnchanged: "文档已经符合格式化规则。",
      copied: "已复制 TOML 源码。",
      downloaded: "已下载 TOML 源码。",
      engineError: (message) => `引擎错误：${message}`,
      actionFailure: (title, message) => `${title}${message}`,
    },
    errors: {
      engineTitle: "引擎无法启动。",
      engineHint: "请确认已启用 WebAssembly，然后重新加载页面。",
      copyUnavailableTitle: "无法使用复制功能。",
      copyUnavailableMessage: "浏览器未提供剪贴板访问能力。",
      copyUnavailableHint: "请选择源码并手动复制。",
      copyFailedTitle: "复制失败。",
      copyFailedHint: "请允许剪贴板访问，或选择源码后手动复制。",
      downloadFailedTitle: "下载失败。",
      downloadFailedHint: "请检查浏览器下载权限后重试。",
    },
  },
};

const LOCALE_STORAGE_KEY = "tomlsmith.playground.locale.v1";

interface I18nValue {
  locale: Locale;
  messages: Messages;
  selectLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nValue | null>(null);

interface I18nProviderProps {
  storage: Storage;
  preferredLanguages?: readonly string[];
  children: ReactNode;
}

export function I18nProvider({
  storage,
  preferredLanguages,
  children,
}: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>(() =>
    loadLocale(storage, preferredLanguages ?? browserLanguages()),
  );
  const selectLocale = useCallback(
    (nextLocale: Locale) => {
      setLocale(nextLocale);
      saveLocale(storage, nextLocale);
    },
    [storage],
  );
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      messages: locale === "zh-Hans" ? ZH_HANS_MESSAGES : EN_MESSAGES,
      selectLocale,
    }),
    [locale, selectLocale],
  );

  useLayoutEffect(() => {
    const previous = document.documentElement.lang;
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = description?.content;
    document.documentElement.lang = locale;
    document.title = value.messages.document.title;
    if (description !== null) {
      description.content = value.messages.document.description;
    }
    return () => {
      document.documentElement.lang = previous;
      document.title = previousTitle;
      if (description !== null && previousDescription !== undefined) {
        description.content = previousDescription;
      }
    };
  }, [locale, value.messages.document]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}

export function loadLocale(
  storage: Storage,
  preferredLanguages: readonly string[],
): Locale {
  try {
    const stored = storage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // Browser privacy modes may reject reads. Language detection still works.
  }
  for (const language of preferredLanguages) {
    if (isChineseLanguage(language)) {
      return "zh-Hans";
    }
    if (language.toLowerCase().startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

export function saveLocale(storage: Storage, locale: Locale): void {
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The in-memory React preference remains active when persistence is blocked.
  }
}

function browserLanguages(): readonly string[] {
  try {
    if (navigator.languages.length > 0) {
      return navigator.languages;
    }
    return navigator.language === "" ? [] : [navigator.language];
  } catch {
    return [];
  }
}

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh-Hans";
}

function isChineseLanguage(language: string): boolean {
  return language.toLowerCase().startsWith("zh");
}
