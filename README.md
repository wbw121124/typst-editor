# Typst 编辑器

一个基于 Web 的 Typst 编辑器，支持浏览器内实时编译与预览、语法高亮、代码补全、多标签页编辑与离线包管理。

## 功能特性

- **Monaco 编辑器**：Typst 语法高亮（TextMate 语法）、代码片段、中文界面，默认使用 Fira Code 字体（含代码连字）
- **LSP 式体验**：自动补全、悬停提示、文档格式化（基于 typst-web-service）
- **实时预览**：Canvas 渲染与 PDF 双模式，支持缩放、懒加载分页
- **错误翻译**：编译错误消息自动翻译为中文（正则规则匹配，错误面板与编辑器提示均生效）
- **导出**：一键导出 SVG / PDF
- **项目管理**：文件树浏览、多标签页编辑、手动保存（`Ctrl+S`）、未保存离开提醒
- **快捷键**：常用操作全部支持快捷键（见下表）
- **离线可用**：内置 Typst 包镜像（`packages/@preview`）与中文字体、Fira Code 字体，编译在浏览器本地完成

## 技术栈

| 模块 | 用途 |
| --- | --- |
| [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) | Typst WASM 编译器与渲染器 |
| [typst-web-service](https://github.com/vedivad/typst-web-service) | 补全 / 悬停 / 格式化等语言服务 |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 代码编辑器 |
| [pdf.js-element](https://github.com/MatthiasPortzel/pdf.js-element) | PDF 预览与导出 |
| [Vite](https://vitejs.dev/) + [Express](https://expressjs.com/) | 开发服务器与文件 API |

## 环境要求

- Node.js ≥ 18（内置 `fetch`，无需 PowerShell）

## 快速开始

```bash
# 1. 安装依赖（会自动执行 script/install.cjs 下载离线 Typst 包，需联网）
npm install

# 2. 启动开发服务器
npm run dev
```

浏览器打开 <http://localhost:3000> 即可开始编辑。

### 构建

```bash
npm run build   # 输出到 dist/
npm run preview # 预览构建产物
```

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+S` | 保存所有文件 |
| `Ctrl+N` | 新建 `.typ` 文件 |
| `Ctrl+Alt+E` | 导出 SVG |
| `Ctrl+Alt+P` | 导出 PDF |
| `Ctrl+Alt+C` | 重新编译（Canvas 模式渲染 / PDF 模式刷新） |
| `Ctrl+滚轮` | 预览区缩放（Canvas 模式） |

## 目录结构

```
├── index.html               # 页面结构
├── server.js                # Express + Vite 开发服务器与文件 API（含路径穿越防护）
├── src/
│   ├── main.js              # 编辑器装配入口
│   ├── typst-lang.js        # 语言注册与代码片段
│   ├── textmate.js          # TextMate 语法高亮
│   ├── typst-compiler-worker.js # WASM 编译 Worker
│   ├── typst-project.js     # 项目级语言服务
│   ├── lsp-adapter.js       # Monaco 补全 / 悬停 / 格式化适配
│   ├── compiler.js          # Worker 管理、文件同步与诊断透传
│   ├── editor-core.js       # 标签页 / 打开 / 保存 / 跳转错误
│   ├── file-tree.js         # 文件树与右键菜单
│   ├── preview.js           # 预览渲染（Canvas / PDF / 导出 / 缩放）
│   ├── error-translations.js# Typst 错误消息中文翻译（正则规则）
│   ├── state.js             # 会话状态单例
│   ├── shortcuts.js         # 快捷键
│   ├── ui.js                # 状态栏等 UI 更新
│   ├── utils.js             # 通用工具函数
│   └── style.css            # 样式
├── public/                  # 字体（含 Fira Code）、WASM、pdf-worker-shim.mjs
├── packages/@preview/       # 离线 Typst 包镜像
├── pdf.js-element/          # 内置的 PDF 查看器组件
├── typst/                   # 工作区：存放 .typ 源文件
└── script/install.cjs       # 离线包下载脚本（npm install 时自动执行）
```

## 离线包下载

编辑器通过 `packages/@preview` 提供 Typst 包，可离线使用。`npm install` 时会自动运行 `script/install.cjs`，也可手动执行：

```bash
node script/install.cjs        # 下载各包的最新版本（含自动解析的传递依赖）
node script/install.cjs --all  # 下载全部历史版本
```

脚本会：

1. 从官方索引拉取指定包名的版本（默认仅最新版，`--all` 下载全部版本）
2. 增量下载：已存在的包自动跳过
3. 自动解析 `typst.toml` 中的 `[dependencies]` 并递归补全依赖包
4. 保存到 `packages/@preview`

如需增删包，编辑 `script/install.cjs` 中的 `TARGET_PACKAGES` 数组后重新运行。

## 常见问题

**PDF 预览中字体显示不正确（如数学公式字体异常）**

pdf.js-element 内置的 pdf.js 6.3.49 使用了较新的 `Math.sumPrecise` API（需 Chrome 130+）。旧版浏览器会因此导致 PDF 嵌入字体解码失败。项目已通过 `public/pdf-worker-shim.mjs`（含 polyfill 的 Worker 包装，由 `src/preview.js` 的 `worker-src` 引用）解决，无需修改 `pdf.js-element/`。

## 许可证

[GPL-3.0-only](./package.json)
