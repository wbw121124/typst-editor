import { registerTypstLanguage, registerTypstSnippets } from './typst-lang';
import { initTextMateGrammar, registerTextMateLanguage } from './textmate';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import './monaco-locale.js';
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/style.css';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { initProject, isReady as isWasmReady, syncFile, destroyProject } from './typst-project.js';
import { registerLspFeatures } from './lsp-adapter.js';
import { session } from './state.js';
import { fileExists, writeFile } from './file-api.js';
import { setOnWorkspaceSynced, syncWorkerFile } from './compiler.js';
import {
  setupZoom,
  setupLazyRender,
  doRender,
  refreshPdf,
  schedulePdfRefresh,
  exportSVG,
  exportPDF,
  setErrorJumpHandler,
  cleanupPreview,
  handlePreviewWheel,
} from './preview.js';
import {
  openFile,
  renderTabs,
  saveAllFiles,
  jumpToError,
} from './editor-core.js';
import { updateSaveStatus, updateStatusBar } from './ui.js';
import { setupFileTree, loadFileTree } from './file-tree.js';
import { setupShortcuts } from './shortcuts.js';
import '../pdf.js-element/pdf-viewer-element.css';

window.MonacoEnvironment = {
  getWorker(_, label) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

const DEFAULT_CONTENT = `// 欢迎使用 Typst 编辑器！
// 工作区: ./typst/
#import "@preview/cuti:0.4.0": show-cn-fakebold
#show: show-cn-fakebold

#set page(paper: "a4", margin: (x: 2.5cm, y: 2.5cm))
#set text(size: 12pt, lang: "zh", font: ("Roboto", "Noto Sans CJK SC", "Noto Serif CJK SC"))

= 你好，Typst！

这是一个 *Typst* 文档的实时预览编辑器。

== 功能特性

- 在 \`./typst/\` 工作区中管理文件
- 编辑时实时预览
- Monaco Editor 语法高亮
- 导出为 SVG 或 PDF
- 有机化学结构绘制（alchemist 包）

== 数学公式

$ integral_0^oo e^(-x^2) dif x = sqrt(pi) $

== 有机化学示例

#import "@preview/alchemist:0.2.0": *

// 乙醇 (Ethanol)
乙醇：
#skeletize({
  single(angle: 0.5)
  single(angle: -0.5)
  fragment("OH")
})

// 苯 (Benzene) - 环状结构
苯：
#skeletize({
  cycle(6, {
    double()
    single()
    double()
    single()
    double()
    single()
  })
})

// 乙酸 (Acetic acid)
乙酸：
#skeletize({
  fragment("H")
  single()
  fragment("C")
  branch({
    single(angle: -2)
    fragment("H")
  })
  branch({
    single(angle: 2)
    fragment("H")
  })
  single()
  fragment("C")
  branch({
    double(angle: 1)
    fragment("O")
  })
  branch({
    single(angle: -1)
    fragment("O")
    single()
    fragment("H")
  })
})

// 丙氨酸 (Alanine)
丙氨酸：
#skeletize({
  single(angle: -0.5)
  branch({
    cram-filled-left(angle: -2)
    fragment("NH_2")
  })
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  fragment("OH")
})

// 谷氨酸钠 (MSG / 味精)
// HOOC-CH(NH₂)-CH₂-CH₂-COO⁻Na⁺
谷氨酸钠：
#skeletize({
  // HO-C(=O) (左侧羧酸)
  fragment("HO")
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  branch({
    single(angle: -2)
    fragment("NH_2")
  })
  single(angle: 0.5)
  single(angle: -0.5)
  single(angle: 0.5)
  branch({
    double(angle: 2)
    fragment("O")
  })
  single(angle: -0.5)
  fragment("O^-")
  single(stroke: white)
  fragment("Na^+")
})

// 肾上腺素 (Adrenaline / Epinephrine)
肾上腺素：
#skeletize({
  cycle(6, {
    branch({
      single()
      fragment("HO")
    })
    single()
    double()
    cycle(6, {
      single(stroke: transparent)
      single(
        stroke: transparent,
        to: 1
      )
      fragment("HN")
      branch({
        single(angle: -1)
        fragment("CH_3")
      })
      single(from: 1)
      single()
      branch({
        cram-filled-left(angle: 2)
        fragment("OH")
      })
      single()
    })
    single()
    double()
    single()
    branch({
      single()
      fragment("HO")
    })
    double()
  })
})

== 表格示例

#table(
  columns: 3,
  [姓名], [年龄], [城市],
  [张三], [30], [北京],
  [李四], [25], [上海],
  [王五], [35], [深圳],
)

== 中文排版

Typst 支持高质量的中文排版，包括：

- 自动换行与标点挤压
- 中英文混排
- 数学公式中的中文
`;

async function initTypst() {
  const statusEl = document.getElementById('preview-status');
  statusEl.textContent = '正在加载 Typst 编译器...';

  try {
    const base = location.origin + '/packages/';
    const accessModel = new MemoryAccessModel();

    const provider = TypstSnippet.fetchPackageBy(accessModel, (spec) => {
      const url = `${base}@${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;
      try {
        const request = new XMLHttpRequest();
        request.overrideMimeType('text/plain; charset=x-user-defined');
        request.open('GET', url, false);
        request.send(null);
        if (request.status === 200 && typeof request.response === 'string') {
          return Uint8Array.from(request.response, (c) => c.charCodeAt(0));
        }
        return undefined;
      } catch (e) {
        console.error(`Failed to fetch ${url}:`, e);
      }
      return undefined;
    });

    $typst.use(
      TypstSnippet.preloadFonts([
        '/fonts/NotoSansCJKsc-Regular.otf',
        '/fonts/NotoSerifCJKsc-Regular.otf',
        '/fonts/LXGWWenKai-Regular.ttf',
        '/fonts/InriaSerif-Regular.ttf',
        '/fonts/InriaSerif-Bold.ttf',
        '/fonts/InriaSerif-Italic.ttf',
        '/fonts/InriaSerif-BoldItalic.ttf',
        '/fonts/Roboto-Regular.ttf',
        '/fonts/JetBrainsMono-Regular.ttf',
        '/Fira_Code_v6.2/ttf/FiraCode-Regular.ttf',
        '/Fira_Code_v6.2/ttf/FiraCode-Bold.ttf',
      ]),
      TypstSnippet.withAccessModel(accessModel),
      provider,
    );

    $typst.setCompilerInitOptions({
      getModule: () =>
        fetch('/typst-wasm/typst_ts_web_compiler_bg.wasm').then((r) => r.arrayBuffer()),
    });
    $typst.setRendererInitOptions({
      getModule: () =>
        fetch('/typst-wasm/typst_ts_renderer_bg.wasm').then((r) => r.arrayBuffer()),
    });

    session.typstReady = true;
    statusEl.textContent = '就绪';
  } catch (err) {
    statusEl.textContent = '加载 Typst 失败: ' + (err.message || err);
    console.error(err);
  }
}

async function initEditor(monaco) {
  // Initialize TextMate grammar
  await initTextMateGrammar(monaco);

  // Register language configuration (brackets, comments, folding, etc.)
  registerTypstLanguage(monaco);

  // Register TextMate grammar for syntax highlighting (injects Dark+ theme colors)
  await registerTextMateLanguage(monaco, 'typst', 'source.typst');

  // Register snippets
  registerTypstSnippets(monaco);

  const editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'typst',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace",
    fontLigatures: '"cv02", "zero", "cv01", "cv06", "ss01", "ss05", "ss03", "cv30", "ss08"',
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    padding: { top: 10 },
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    contextmenu: true,
  });
  session.editor = editor;

  let compileTimer = null;

  editor.onDidChangeModelContent(() => {
    if (!session.currentFile) return;
    const statusEl = document.getElementById('preview-status');
    statusEl.innerText = '准备编译中...';
    session.fileCache[session.currentFile] = editor.getValue();
    session.dirtyFiles.add(session.currentFile);
    updateSaveStatus();
    const treeEl = document.querySelector(
      `.file-item[data-path="${CSS.escape(session.currentFile)}"]`
    );
    if (treeEl) treeEl.classList.add('dirty');
    renderTabs();

    if (isWasmReady()) {
      syncFile(session.currentFile, editor.getValue()).catch((e) =>
        console.warn('[TypstProject] Sync failed:', e)
      );
    }
    syncWorkerFile(session.currentFile, editor.getValue());

    clearTimeout(compileTimer);
    if (session.previewMode === 'canvas') {
      compileTimer = setTimeout(() => doRender(), 1000);
    } else {
      schedulePdfRefresh();
    }
  });

  editor.onDidChangeCursorPosition((e) => {
    const posEl = document.getElementById('statusbar-pos');
    if (posEl) {
      posEl.textContent = `行 ${e.position.lineNumber}, 列 ${e.position.column}`;
    }
  });

  return editor;
}

function setupDivider() {
  const divider = document.getElementById('divider');
  const editorContainer = document.getElementById('editor-container');
  const previewContainer = document.getElementById('preview-container');
  let isDragging = false;
  let editorRatio = 0.5;

  function isVerticalLayout() {
    return window.innerWidth <= 1000;
  }

  function getSidebarWidth() {
    if (window.innerWidth <= 768) return 0;
    return document.getElementById('sidebar').offsetWidth;
  }

  function applyEditorSize() {
    const main = document.getElementById('main');
    const mainRect = main.getBoundingClientRect();
    const vertical = isVerticalLayout();
    const isGrid = getComputedStyle(main).display === 'grid';

    if (vertical) {
      const dividerHeight = document.getElementById('divider').offsetHeight || 4;
      const availableHeight = mainRect.height - dividerHeight;
      const editorHeight = Math.max(
        availableHeight * 0.2,
        Math.min(availableHeight * 0.8, availableHeight * editorRatio)
      );

      if (isGrid) {
        main.style.gridTemplateRows = `${editorHeight}px ${dividerHeight}px 1fr`;
      } else {
        editorContainer.style.flex = `0 0 ${editorHeight}px`;
        previewContainer.style.flex = `1`;
      }
    } else {
      const sidebarWidth = getSidebarWidth();
      const dividerWidth = document.getElementById('divider').offsetWidth;
      const availableWidth = mainRect.width - sidebarWidth - dividerWidth / 2;
      const editorWidth = Math.max(
        availableWidth * 0.2,
        Math.min(availableWidth * 0.8, availableWidth * editorRatio)
      );
      editorContainer.style.flex = `0 0 ${editorWidth}px`;
      previewContainer.style.flex = `1`;
    }
    if (session.editor) session.editor.layout();
  }

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.cursor = isVerticalLayout() ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const main = document.getElementById('main');
    const mainRect = main.getBoundingClientRect();
    const vertical = isVerticalLayout();

    if (vertical) {
      const dividerHeight = document.getElementById('divider').offsetHeight || 4;
      const availableHeight = mainRect.height - dividerHeight;
      const offset = e.clientY - mainRect.top;
      editorRatio = Math.max(0.2, Math.min(0.8, offset / availableHeight));
    } else {
      const sidebarWidth = getSidebarWidth();
      const dividerWidth = document.getElementById('divider').offsetWidth;
      const availableWidth = mainRect.width - sidebarWidth - dividerWidth;
      const offset = e.clientX - mainRect.left - sidebarWidth;
      editorRatio = Math.max(0.2, Math.min(0.8, offset / availableWidth));
    }
    applyEditorSize();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  window.addEventListener('resize', applyEditorSize);
}

function setupFontSize() {
  const input = document.getElementById('font-size');
  input.addEventListener('change', () => {
    const size = parseInt(input.value, 10);
    if (size >= 10 && size <= 40 && session.editor) {
      session.editor.updateOptions({ fontSize: size });
    }
  });
}

async function main() {
  window.monaco = monaco;

  await initEditor(monaco);
  setupDivider();
  setupFontSize();
  setupZoom();
  setupLazyRender();
  setupFileTree();

  registerLspFeatures(monaco, session.editor);

  document.getElementById('btn-save').addEventListener('click', saveAllFiles);
  document.getElementById('btn-export-svg').addEventListener('click', exportSVG);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  setErrorJumpHandler(jumpToError);
  setOnWorkspaceSynced(() => {
    if (session.editor && session.currentFile) {
      if (session.previewMode === 'canvas') {
        doRender();
      } else {
        refreshPdf();
      }
    }
  });
  updateSaveStatus();
  updateStatusBar();
  renderTabs();
  setupShortcuts();

  const previewEl = document.getElementById('preview');
  if (previewEl) {
    previewEl.addEventListener('wheel', handlePreviewWheel, { passive: false });
  }

  initProject('/main.typ').catch((e) =>
    console.warn('[TypstProject] Init failed, LSP features disabled:', e)
  );

  await initTypst();
  await loadFileTree();

  const defaultFile = 'main.typ';
  const exists = await fileExists(defaultFile);
  if (!exists) {
    await writeFile(defaultFile, DEFAULT_CONTENT);
    await loadFileTree();
  }
  const lastFile = localStorage.getItem('typst-editor:last-file');  let target = defaultFile;
  if (lastFile && lastFile !== defaultFile && (await fileExists(lastFile))) {
    target = lastFile;
  }
  openFile(target);

  window.addEventListener('beforeunload', (e) => {
    if (session.dirtyFiles.size > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
    cleanupPreview();
    destroyProject();
  });
}

main();
