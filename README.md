# Typst 编辑器

一个基于 Web 的 Typst 编辑器，支持浏览器内实时编译与预览、语法高亮、代码补全、多标签页编辑与离线包管理。

## 功能特性

- **Monaco 编辑器**：Typst 语法高亮（TextMate 语法）、代码片段、中文界面
- **LSP 式体验**：自动补全、悬停提示、文档格式化（基于 typst-web-service）
- **实时预览**：Canvas 渲染与 PDF 双模式，支持缩放、懒加载分页
- **导出**：一键导出 SVG / PDF
- **项目管理**：文件树浏览、多标签页编辑、自动保存（5 秒）、未保存离开提醒
- **快捷键**：常用操作全部支持快捷键（见下表）
- **离线可用**：内置 Typst 包镜像（`packages/@preview`）与中文字体，编译在浏览器本地完成

## 技术栈

| 模块 | 用途 |
| --- | --- |
| [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) | Typst WASM 编译器与渲染器 |
| [typst-web-service](https://github.com/vedivad/typst-web-service) | 补全 / 悬停 / 格式化等语言服务 |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 代码编辑器 |
| [pdf.js-element](https://github.com/MatthiasPortzel/pdf.js-element) | PDF 预览与导出 |
| [Vite](https://vitejs.dev/) + [Express](https://expressjs.com/) | 开发服务器与文件 API |

## 环境要求

- Node.js ≥ 18
- PowerShell（用于 `download_all_versions.ps1` 下载离线包）

## 快速开始

```bash
# 1. 安装依赖（会自动下载离线 Typst 包，需联网）
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
├── server.js                # Express + Vite 开发服务器与文件 API
├── src/
│   ├── main.js              # 编辑器主逻辑
│   ├── typst-lang.js        # 语言注册与代码片段
│   ├── textmate.js          # TextMate 语法高亮
│   ├── typst-compiler-worker.js # WASM 编译 Worker
│   ├── typst-project.js     # 项目级语言服务
│   ├── lsp-adapter.js       # Monaco 补全 / 悬停 / 格式化适配
│   └── style.css            # 样式
├── public/                  # 字体、WASM、语法文件
├── packages/@preview/       # 离线 Typst 包镜像
├── pdf.js-element/          # 内置的 PDF 查看器组件
├── typst/                   # 工作区：存放 .typ 源文件
└── download_all_versions.ps1 # 离线包下载脚本
```

## 离线包下载

编辑器通过 `packages/@preview` 提供 Typst 包，可离线使用。重新下载或更新包列表后，运行：

```powershell
.\download_all_versions.ps1
```

脚本会：

1. 从官方索引拉取指定包名的所有版本
2. 增量下载：已存在的包自动跳过
3. 保存到 `packages/@preview`

如需增删包，编辑脚本中的 `$TargetPackages` 列表后重新运行。

## 许可证

[GPL-3.0-only](./package.json)
