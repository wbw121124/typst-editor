# 字体许可证说明 (Font Licenses)

本目录包含 Typst 编辑器运行时所需的全部字体资源，均为本地化部署，运行时无任何 CDN 请求。

## 许可证汇总

| 字体 | 目录 | 许可证 | 版权/来源 |
|------|------|--------|-----------|
| Noto Sans CJK SC | `fonts/` | SIL Open Font License 1.1 | Google LLC |
| Noto Serif CJK SC | `fonts/` | SIL Open Font License 1.1 | Google LLC |
| LXGW WenKai (霞鹜文楷) | `fonts/` | SIL Open Font License 1.1 | LXGW (lxgw/LxgwWenKai) |
| Inria Serif | `fonts/` | SIL Open Font License 1.1 | Google Fonts / BlackFoundry |
| Roboto | `fonts/` | Apache License 2.0 | Google LLC |
| JetBrains Mono | `fonts/` | SIL Open Font License 1.1 | JetBrains |
| Fira Code | `Fira_Code_v6.2/` | SIL Open Font License 1.1 | Nikita Prokopov (tonsky/FiraCode) |
| KaTeX 字体 (KaTeX_*) | `fonts/katex/` | SIL Open Font License 1.1 | Copyright (c) 2009-2010 Design Science, Inc. & Copyright (c) 2014-2018 Khan Academy |
| MathJax 字体 (MathJax_*) | `fonts/mathjax/` | SIL Open Font License 1.1 (with Reserved Font Names MathJax_*) | Copyright (c) 2009-2010 Design Science, Inc. (mathjax.org) |
| DejaVu Sans Mono | `fonts/typst-assets/` | Bitstream Vera License (DejaVu 修改部分公有领域) | Bitstream Inc. / DejaVu 项目 |
| Libertinus Serif | `fonts/typst-assets/` | SIL Open Font License 1.1 | Libertinus 项目 |
| New Computer Modern (NewCM*) | `fonts/typst-assets/` | GPL-3.0 + Font Exception (GPL3+FE) | Copyright (c) 2019-2026 Antonis Tsolomitis |
| Foxit 字体 (*.pfb) | `fonts/typst-assets/` | 经 typst-assets 仓库 (Apache 2.0) 分发；原始字体版权属 Foxit Software | typst/typst-assets |

## 详细说明

### 从 typst-assets 仓库获取的字体 (`fonts/typst-assets/`)
来源: https://github.com/typst/typst-assets (v0.15.1)
仓库整体许可证: Apache License 2.0

各字体本身使用各自的许可证（见上方表格）：

- **DejaVu Sans Mono**: Bitstream Vera 字体系列由 Bitstream 公司以宽松许可发布（允许自由复制、修改、再分发），DejaVu 项目的修改部分声明为公有领域。许可证全文: https://dejavu.sourceforge.net/wiki/index.php/License
- **Libertinus Serif**: SIL Open Font License 1.1 (https://openfontlicense.org)
- **New Computer Modern**: GPL-3.0 + Font Exception，见 https://www.gnu.org/licenses/gpl-faq.html#FontException，Distribution Exception 添加于 GPL-3.0 第 7 节
- **Foxit *.pfb**: PDF 标准 14 字体，随 typst-assets 以 Apache 2.0 提供；原始 Type 1 字体版权归 Foxit Software

### KaTeX 字体 (`fonts/katex/`)
来源: https://github.com/KaTeX/KaTeX (v0.18.1)
KaTeX 项目本体: MIT License (Copyright 2013-2020 Khan Academy and other contributors)
KaTeX 字体: SIL Open Font License 1.1，版权 Copyright (c) 2009-2010 Design Science, Inc. (MathJax 作者) 与 Copyright (c) 2014-2018 Khan Academy

### MathJax 字体 (`fonts/mathjax/`)
来源: https://github.com/mathjax/MathJax (字体文件为 woff 格式，本地已转换为 ttf)
MathJax 字体: SIL Open Font License 1.1，保留字体名 (Reserved Font Names) MathJax_AMS / MathJax_Caligraphic / MathJax_Fraktur / MathJax_Main / MathJax_Math / MathJax_SansSerif / MathJax_Script / MathJax_Size1-4 / MathJax_Typewriter
版权 Copyright (c) 2009-2010 Design Science, Inc.

### 来自 Google Fonts / 其他开源项目的字体 (`fonts/`)
- **Noto Sans CJK SC / Noto Serif CJK SC**: Google 出品，SIL OFL 1.1
- **LXGW WenKai**: 霞鹜文楷，SIL OFL 1.1
- **Inria Serif**: BlackFoundry 为 Inria 设计，SIL OFL 1.1
- **Roboto**: Google，Apache License 2.0
- **JetBrains Mono**: JetBrains，SIL OFL 1.1
- **Fira Code**: Nikita Prokopov，SIL OFL 1.1

## 许可证文本链接

- SIL Open Font License 1.1: https://openfontlicense.org / https://scripts.sil.org/OFL
- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0
- GPL-3.0 + Font Exception: https://www.gnu.org/licenses/gpl-faq.html#FontException
- Bitstream Vera / DejaVu 许可证: https://dejavu.sourceforge.net/wiki/index.php/License

## 说明

- `fonts/mathjax/` 下的 `.ttf` 文件由本项目使用 fonttools 从 `.woff` 转换而来，转换不改变字体数据及许可证。
- `fonts/katex/` 下的 `.woff` / `.woff2` 为 KaTeX 原始发布文件。
- 字体文件仅供本编辑器本地运行使用，再分发需遵守各自许可证条款。
