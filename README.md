# Typst 编辑器

一个基于 Web 的 Typst 编辑器，同时提供 **浏览器版** 与 **Electron 桌面版**，支持实时编译与预览、语法高亮、代码补全、多标签页编辑与离线包管理。

## 功能特性

- **Monaco 编辑器**：Typst 语法高亮（TextMate 语法）、代码片段、中文界面，默认使用 Fira Code 字体（含代码连字）
- **LSP 式体验**：自动补全、悬停提示、文档格式化（基于 typst-web-service）
- **实时预览**：Canvas 渲染与 PDF 双模式，支持缩放、懒加载分页
- **错误翻译**：编译错误消息自动翻译为中文（正则规则匹配，错误面板与编辑器提示均生效）
- **导出**：一键导出 SVG / PDF
- **项目管理**：文件树浏览、多标签页编辑、拖拽排序、标签页/光标位置/滚动位置自动恢复、手动保存（`Ctrl+S`）、未保存离开提醒
- **跳转**：`Ctrl+点击` 从 include/import 处跳转到目标文件
- **快捷键**：常用操作全部支持快捷键（见下表）
- **离线可用**：内置 Typst 包镜像（`packages/@preview`）与中文字体、Fira Code 字体，编译在本地（浏览器 WASM 或桌面版）完成

## 技术栈

| 模块 | 用途 |
| --- | --- |
| [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) | Typst WASM 编译器与渲染器 |
| [typst-web-service](https://github.com/vedivad/typst-web-service) | 补全 / 悬停 / 格式化等语言服务 |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 代码编辑器 |
| [pdf.js-element](https://github.com/MatthiasPortzel/pdf.js-element) | PDF 预览与导出 |
| [Vite](https://vitejs.dev/) + [Express](https://expressjs.com/) | 开发服务器与文件 API |
| [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) | 桌面版与安装包 |

## 环境要求

- Node.js ≥ 20.19（Vite 8 要求；Windows 需 PowerShell 7 或 cmd）
- 首次安装需联网（下载依赖与离线 Typst 包；Electron 二进制走 npmmirror 国内镜像）

## 浏览器版

```bash
# 1. 安装依赖（会自动执行 script/install.cjs 下载离线 Typst 包）
npm install

# 2. 启动开发服务器
npm run dev
```

浏览器打开 <http://localhost:3000> 即可开始编辑。

## Electron 桌面版

```bash
# 生产模式（先 vite build，再以窗口形式运行，内嵌本地 HTTP 服务、随机端口）
npm run electron

# 开发模式（免构建，直接加载 Vite 开发服务器）
npm run electron:dev

# 打包 Windows 安装包（NSIS，输出到 release/）
npm run dist:win
```

桌面版说明：

- 未打包时使用项目内 `typst/` 作为工作区、`typst-cache/` 作为历史/草稿目录；`typst/` 与 `packages/` 随构建产物一起分发
- 安装包版本首次启动会在 `%APPDATA%/Typst Editor/` 创建独立 `config.yml`（含默认 `workspace` 与 `cache` 目录），并从内置模板初始化工作区
- `F12` 打开开发者工具；`View` 菜单可缩放/刷新

## 配置文件（config.yml）

项目根目录的 `config.yml`（浏览器版 / 开发模式）与桌面版用户数据目录下的 `config.yml` 均可配置编辑器行为：

```yaml
workspace:
  path: typst              # 工作区目录（相对本文件所在目录）
  defaultFile: main.typ    # 默认入口文件（不存在时自动创建）
cache:
  path: typst-cache        # 历史记录与草稿目录
packages:
  path: packages           # Typst 包镜像目录
server:
  port: 3000               # 开发服务器端口（npm run dev 时生效）
```

优先级：环境变量（`TYPST_WORKSPACE` / `TYPST_CACHE_ROOT` / `TYPST_PACKAGES` / `TYPST_CONFIG`）> `config.yml` > 内置默认值。桌面版安装后编辑 `%APPDATA%/Typst Editor/config.yml` 即可改变工作区位置。

## 构建

```bash
npm run build   # 浏览器版构建产物输出到 dist/（Electron 版复用同一份产物）
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
├── server.js                # Express 文件 API + 静态服务（导出 createApp / serveStaticDist，供 Electron 复用）
├── config.yml               # 编辑器配置文件（工作区 / 默认文件 / 端口等）
├── electron/
│   ├── main.mjs             # Electron 主进程（内嵌 HTTP 服务器 + 加载前端）
│   ├── preload.cjs          # 预加载脚本（contextBridge 暴露桌面能力）
│   └── config.template.yml  # 桌面版配置模板（打包后作为默认配置分发）
├── src/
│   ├── main.js              # 编辑器装配入口
│   ├── typst-lang.js        # 语言注册与代码片段
│   ├── textmate.js          # TextMate 语法高亮
│   ├── typst-compiler-worker.js # WASM 编译 Worker
│   ├── typst-project.js     # 项目级语言服务
│   ├── lsp-adapter.js       # Monaco 补全 / 悬停 / 格式化适配
│   ├── compiler.js          # Worker 管理、文件同步与诊断透传
│   ├── editor-core.js       # 标签页 / 打开 / 保存 / 跳转错误 / 光标位置恢复
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

**Electron 桌面版 PDF 预览报错 "hashOriginal.toHex is not a function"**

pdf.js 6.3.49 依赖 ES2025 原生 `Uint8Array.prototype.toHex`（Chromium 131+ 提供），Electron 33（Chromium 130）及更早版本没有该 API 会直接崩溃。项目已在 `public/pdf-worker-shim.mjs`（Worker 线程）与 `src/main.js`（主线程）两处加入等价 polyfill，新 Chromium 浏览器不受影响。

## 许可证

[GPL-3.0-only](./package.json)
