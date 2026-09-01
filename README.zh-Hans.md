# TomlSmith Playground

[English](README.md) | **简体中文**

[![CI](https://github.com/tomlsmith/playground/actions/workflows/ci.yml/badge.svg)](https://github.com/tomlsmith/playground/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**在浏览器中检查和格式化 TOML 1.0 与 1.1。**

TomlSmith Playground 通过 WebAssembly 使用 [TomlSmith](https://github.com/tomlsmith/tomlsmith)，分析与格式化都在当前浏览器标签页中运行。

[打开 Playground](https://tomlsmith.github.io/playground/)，或从源码检出运行工作台。当前源码精确固定 TomlSmith core `0.3.1`；Cargo、CI 与部署会依据 `Cargo.toml` 和 `Cargo.lock` 从 crates.io 获取该版本。

## 主要功能

- 显式切换 TOML 1.0 与 TOML 1.1。
- 新建或重置后的会话默认使用 TOML 1.1；所选版本会随本地工作副本一起保存。
- 编辑时自动刷新诊断和格式化预览。只有主动应用时，预览才会改动源码。
- 按源码位置跳转诊断，悬停或使用键盘聚焦时可以查看信息。
- 并排查看格式化文档、诊断、词法单元和文档统计。
- 从内置示例开始，并按需复制、下载或应用格式化结果。
- 界面可选择英文或简体中文，不会上传源码。
- 已部署构建会在页脚显示精确的 TomlSmith core crate 版本。

## 键盘快捷键

| 操作 | 快捷键 |
| --- | --- |
| 立即分析 | <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> |
| 格式化并应用到编辑器 | <kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> |
| 缩进或反缩进 | <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> |
| 将焦点移出编辑器 | 先按 <kbd>Escape</kbd>，再按 <kbd>Tab</kbd> |

## 隐私

Playground 只会在浏览器本地存储最近一次源码、所选 TOML 版本和界面语言，不会上传源码，也不会持久化生成的格式化预览。清除站点数据或点击 **重置** 即可移除保存的工作副本。

## 参与贡献

开发与验证说明请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

TomlSmith Playground 依据 [MIT License](LICENSE) 发布。
