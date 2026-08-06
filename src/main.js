import { registerTypstLanguage, registerTypstSnippets } from './typst-lang';
import { initTextMateGrammar, registerTextMateLanguage } from './textmate';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/dist/esm/renderer.mjs';
import './monaco-locale.js';
import * as monaco from 'monaco-editor';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { initProject, syncFile, isReady as isWasmReady, destroyProject } from './typst-project.js';
import { registerLspFeatures } from './lsp-adapter.js';
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

let editor = null;
let currentFile = null;
let fileCache = {};
let compileTimer = null;
let typstReady = false;
let zoomLevel = 100;
let cachedVectorData = null;
let renderChain = Promise.resolve();
let zoomTimer = null;
let lazyTimer = null;
let zoomAnchor = null;
let renderedPageIndices = new Set();
let hiddenCanvas = null;
let compilerWorker = null;
let compilerRequestId = 0;
const compilerPending = new Map();
const LAZY_MARGIN = 200;
let pdfViewerEl = null;
let pdfObjectUrl = null;
let pdfTimer = null;
let pdfModulePromise = null;
let previewMode = 'pdf';
const LARGE_FILE_THRESHOLD = 100000;
const openTabs = [];
const fileModels = new Map();
const dirtyFiles = new Set();
let lastWorkerDiagnostics = [];
let lastErrors = [];
let autoSaveTimer = null;

function getHiddenCanvas() {
  if (!hiddenCanvas) hiddenCanvas = document.createElement('canvas');
  return hiddenCanvas;
}

function getCompilerWorker() {
  if (!compilerWorker) {
    compilerWorker = new Worker(new URL('./typst-compiler-worker.js', import.meta.url), {
      type: 'module',
    });
    compilerWorker.addEventListener('message', (event) => {
      const { id, ok, data, error, cancelled, diagnostics } = event.data;
      const pending = compilerPending.get(id);
      if (!pending) return;
      compilerPending.delete(id);
      if (cancelled) {
        pending.resolve({ __cancelled: true });
      } else if (ok) {
        lastWorkerDiagnostics = diagnostics || [];
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || 'compile failed'));
      }
    });
    compilerWorker.addEventListener('error', (event) => {
      const crashed = [...compilerPending.entries()];
      compilerPending.clear();
      const message = event.message || 'compiler worker error';
      const retryable = crashed.filter(([, p]) => (p.retries || 0) < 1);
      const failed = crashed.filter(([, p]) => (p.retries || 0) >= 1);
      compilerWorker = null;
      if (retryable.length > 0) {
        const fresh = getCompilerWorker();
        for (const [id, pending] of retryable) {
          pending.retries = (pending.retries || 0) + 1;
          compilerPending.set(id, pending);
          fresh.postMessage({ id, mainContent: pending.mainContent, format: pending.format });
        }
      }
      for (const [, pending] of failed) {
        pending.reject(new Error(message));
      }
    });
    for (const [vpath, content] of workerFiles) {
      compilerWorker.postMessage({ type: 'sync', path: vpath, content });
    }
  }
  return compilerWorker;
}

function compileInWorker(mainContent, format = 'vector') {
  const id = ++compilerRequestId;
  return new Promise((resolve, reject) => {
    compilerPending.set(id, { resolve, reject, mainContent, format });
    getCompilerWorker().postMessage({ id, mainContent, format });
  });
}

function restartCompilerWorker(skipContent) {
  if (!compilerWorker || compilerPending.size === 0) return;
  for (const pending of compilerPending.values()) {
    if (skipContent !== undefined && pending.mainContent === skipContent) return;
  }
  const old = compilerWorker;
  compilerWorker = null;
  for (const pending of compilerPending.values()) {
    pending.resolve({ __cancelled: true });
  }
  compilerPending.clear();
  old.terminate();
}

const workerFiles = new Map();
let projectFiles = [];

function syncWorkerFile(path, content) {
  const vpath = `/${path}`.replace(/\/+/g, '/');
  workerFiles.set(vpath, content);
  if (compilerWorker) {
    compilerWorker.postMessage({ type: 'sync', path: vpath, content });
  }
}

function removeWorkerFile(path) {
  const vpath = `/${path}`.replace(/\/+/g, '/');
  workerFiles.delete(vpath);
  if (compilerWorker) {
    compilerWorker.postMessage({ type: 'remove', path: vpath });
  }
}

async function syncWorkspaceToWorker(files) {
  let list = files;
  if (!list) {
    try {
      list = await fetch('/api/files').then((r) => r.json());
    } catch {
      return;
    }
  }
  const flat = [];
  (function walk(items) {
    for (const item of items) {
      if (item.type === 'directory') walk(item.children || []);
      else flat.push(item.path);
    }
  })(list);
  projectFiles = flat;
  const valid = new Set(flat.filter((p) => p.endsWith('.typ')).map((p) => `/${p}`));
  for (const path of flat) {
    if (!path.endsWith('.typ')) continue;
    const vpath = `/${path}`;
    if (workerFiles.has(vpath)) continue;
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.content !== undefined) syncWorkerFile(path, data.content);
    } catch {
      // ignore unreadable files
    }
  }
  for (const vpath of [...workerFiles.keys()]) {
    if (!valid.has(vpath)) removeWorkerFile(vpath.replace(/^\//, ''));
  }
  if (editor && currentFile) {
    clearTimeout(compileTimer);
    if (previewMode === 'canvas') {
      doRender();
    } else {
      refreshPdf();
    }
  }
}

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
      ]),
      TypstSnippet.withAccessModel(accessModel),
      provider,
    );

    $typst.setCompilerInitOptions({
      getModule: () =>
        fetch('/typst-wasm/typst_ts_web_compiler_bg.wasm').then(r => r.arrayBuffer()),
    });
    $typst.setRendererInitOptions({
      getModule: () =>
        fetch('/typst-wasm/typst_ts_renderer_bg.wasm').then(r => r.arrayBuffer()),
    });

    typstReady = true;
    statusEl.textContent = '就绪';
  } catch (err) {
    statusEl.textContent = '加载 Typst 失败: ' + (err.message || err);
    console.error(err);
  }
}

let rendererPromise = null;

function withModernWasmInit(mod) {
  return new Proxy(mod, {
    get(target, prop) {
      if (prop === 'default') {
        const init = target.default;
        return (module_or_path) => init({ module_or_path });
      }
      return Reflect.get(target, prop);
    },
  });
}

function getRendererInstance() {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const renderer = createTypstRenderer();
      await renderer.init({
        getWrapper: () =>
          import('@myriaddreamin/typst-ts-renderer').then((mod) => withModernWasmInit(mod)),
        getModule: () =>
          fetch('/typst-wasm/typst_ts_renderer_bg.wasm').then((r) => r.arrayBuffer()),
      });
      return renderer;
    })();
  }
  return rendererPromise;
}

function resetRenderer() {
  rendererPromise = null;
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

  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'typst',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    padding: { top: 10 },
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    contextmenu: true,
  });

  editor.onDidChangeModelContent(() => {
    if (!currentFile) return;
    const statusEl = document.getElementById('preview-status');
    statusEl.innerText = '准备编译中...'
    fileCache[currentFile] = editor.getValue();
    dirtyFiles.add(currentFile);
    updateSaveStatus();
    const treeEl = document.querySelector(`.file-item[data-path="${CSS.escape(currentFile)}"]`);
    if (treeEl) treeEl.classList.add('dirty');
    renderTabs();

    if (isWasmReady()) {
      syncFile(currentFile, editor.getValue()).catch(e =>
        console.warn('[TypstProject] Sync failed:', e)
      );
    }
    syncWorkerFile(currentFile, editor.getValue());

    clearTimeout(pdfTimer);
    clearTimeout(compileTimer);
    if (previewMode === 'canvas') {
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

async function loadFileTree() {
  const tree = document.getElementById('file-tree');
  try {
    const res = await fetch('/api/files');
    const files = await res.json();
    tree.innerHTML = '';
    renderTree(tree, files, '');
    updateTreeDots();
    let count = 0;
    (function walk(items) {
      for (const item of items) {
        if (item.type === 'directory') walk(item.children || []);
        else count++;
      }
    })(files);
    const countEl = document.getElementById('file-count');
    if (countEl) countEl.textContent = `(${count})`;
    syncWorkspaceToWorker(files).catch(e =>
      console.warn('[Worker] Workspace sync failed:', e)
    );
  } catch {
    tree.innerHTML = '<div class="dir-item">加载文件失败</div>';
  }
}

function renderTree(container, items) {
  for (const item of items) {
    if (item.type === 'directory') {
      const wrapper = document.createElement('div');

      const el = document.createElement('div');
      el.className = 'dir-item';
      el.innerHTML = `<span class="arrow">&#9660;</span> ${item.name}`;

      const child = document.createElement('div');
      child.className = 'dir-children';

      const collapseKey = `typst-editor:collapsed:${item.path}`;
      if (localStorage.getItem(collapseKey) === '1') {
        el.classList.add('collapsed');
        child.style.display = 'none';
      }

      el.addEventListener('click', () => {
        const collapsed = el.classList.toggle('collapsed');
        child.style.display = collapsed ? 'none' : '';
        localStorage.setItem(collapseKey, collapsed ? '1' : '0');
      });

      wrapper.appendChild(el);
      wrapper.appendChild(child);
      container.appendChild(wrapper);

      renderTree(child, item.children);
    } else {
      const el = document.createElement('div');
      el.className = 'file-item';
      el.innerHTML = `<span class="icon">&#128196;</span> ${item.name}`;
      el.dataset.path = item.path;
      if (item.path === currentFile) el.classList.add('active');
      el.addEventListener('click', () => openFile(item.path));
      el.addEventListener('contextmenu', (e) => showFileContextMenu(e, item));
      container.appendChild(el);
    }
  }
}

function showFileContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  hideFileContextMenu();

  const container = document.getElementById('file-context-menu');
  container.innerHTML = '';
  container.className = 'monaco-menu-container context-view monaco-editor';

  const menu = document.createElement('div');
  menu.className = 'monaco-menu';

  const actionBar = document.createElement('div');
  actionBar.className = 'monaco-action-bar vertical';

  const actions = document.createElement('div');
  actions.className = 'actions-container';

  const items = [
    { label: '打开', keybinding: 'Enter', id: 'file-open' },
    { label: '重命名', keybinding: 'F2', id: 'file-rename' },
    { label: '删除', keybinding: 'Del', id: 'file-delete' },
  ];

  items.forEach((mi) => {
    const actionItem = document.createElement('div');
    actionItem.className = 'action-item';

    const menuAction = document.createElement('div');
    menuAction.className = 'action-menu-item';

    const label = document.createElement('span');
    label.className = 'action-label';
    label.textContent = mi.label;

    const keybinding = document.createElement('span');
    keybinding.className = 'keybinding';
    keybinding.textContent = mi.keybinding;

    menuAction.appendChild(label);
    menuAction.appendChild(keybinding);

    menuAction.addEventListener('click', () => {
      hideFileContextMenu();
      if (mi.id === 'file-open') openFile(item.path);
      else if (mi.id === 'file-rename') renameFile(item.path);
      else if (mi.id === 'file-delete') deleteFile(item.path);
    });

    menuAction.addEventListener('mouseenter', () => actionItem.classList.add('active'));
    menuAction.addEventListener('mouseleave', () => actionItem.classList.remove('active'));

    actionItem.appendChild(menuAction);
    actions.appendChild(actionItem);
  });

  actionBar.appendChild(actions);
  menu.appendChild(actionBar);
  container.appendChild(menu);

  document.body.appendChild(container);

  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  container.style.left = x + 'px';
  container.style.top = y + 'px';
  container.classList.add('visible');

  setTimeout(() => {
    document.addEventListener('click', hideFileContextMenu, { once: true });
    document.addEventListener('contextmenu', hideFileContextMenu, { once: true });
    document.addEventListener('focusout', hideFileContextMenu, { once: true })
  }, 0);
}

function hideFileContextMenu() {
  const container = document.getElementById('file-context-menu');
  if (container) {
    container.classList.remove('visible');
    container.innerHTML = '';
  }
}

async function renameFile(oldPath) {
  const newName = prompt('新文件名:', oldPath.split('/').pop());
  if (!newName || newName === oldPath.split('/').pop()) return;
  const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
  const newPath = dir ? `${dir}/${newName}` : newName;

  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(oldPath)}`);
    const data = await res.json();
    await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: newPath, content: data.content }),
    });
    await fetch(`/api/file?path=${encodeURIComponent(oldPath)}`, { method: 'DELETE' });
    const wasCurrent = currentFile === oldPath;
    const oldModel = fileModels.get(oldPath);
    fileModels.delete(oldPath);
    const oldIdx = openTabs.indexOf(oldPath);
    if (oldIdx !== -1) openTabs[oldIdx] = newPath;
    fileCache[newPath] = data.content;
    delete fileCache[oldPath];
    if (dirtyFiles.has(oldPath)) {
      dirtyFiles.delete(oldPath);
      dirtyFiles.add(newPath);
    }
    removeWorkerFile(oldPath);
    syncWorkerFile(newPath, data.content);
    await loadFileTree();
    if (wasCurrent) {
      if (oldModel && oldModel === editor.getModel()) {
        await openFile(newPath);
        try { oldModel.dispose(); } catch { /* ignore */ }
      } else {
        await openFile(newPath);
      }
    } else if (oldModel) {
      try { oldModel.dispose(); } catch { /* ignore */ }
    }
    renderTabs();
    updateTreeDots();
  } catch (err) {
    console.error('Rename failed:', err);
  }
}

async function deleteFile(filePath) {
  if (!confirm(`确定删除 ${filePath}？`)) return;
  try {
    await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
    delete fileCache[filePath];
    removeWorkerFile(filePath);
    dirtyFiles.delete(filePath);
    const model = fileModels.get(filePath);
    fileModels.delete(filePath);
    const idx = openTabs.indexOf(filePath);
    if (idx !== -1) openTabs.splice(idx, 1);
    if (currentFile === filePath) {
      if (openTabs.length > 0) {
        const next = openTabs[Math.min(idx, openTabs.length - 1)];
        await switchToTab(next);
      } else {
        currentFile = null;
        if (editor) {
          editor._currentFile = null;
          editor.setModel(null);
        }
        clearPreview();
      }
    }
    if (model) {
      try { model.dispose(); } catch { /* ignore */ }
    }
    renderTabs();
    updateTreeDots();
    updateSaveStatus();
    updateStatusBar();
    await loadFileTree();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

async function fileExists(filePath) {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function saveFileToServer(filePath, content) {
  await fetch('/api/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
}

async function ensureModel(filePath) {
  let model = fileModels.get(filePath);
  if (model) return model;
  let content = fileCache[filePath];
  if (content === undefined) {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      content = data.content;
    } catch {
      content = '';
    }
    fileCache[filePath] = content;
  }
  const ext = filePath.split('.').pop();
  const lang = ext === 'typ' ? 'typst' : ext;
  model = window.monaco?.editor?.createModel?.(content || '', lang);
  fileModels.set(filePath, model);
  return model;
}

function renderCurrentPreview(content) {
  clearTimeout(zoomTimer);
  zoomAnchor = null;
  zoomLevel = 100;
  updateZoomLayout();
  const previewEl = document.getElementById('preview');
  if (previewEl) previewEl.scrollTop = 0;
  if (currentFile) {
    syncWorkerFile(currentFile, content || '');
    if (isWasmReady()) {
      syncFile(currentFile, content || '').catch(e =>
        console.warn('[TypstProject] Sync failed:', e)
      );
    }
  }
  restartCompilerWorker(content || '');
  const mode = (content || '').length > LARGE_FILE_THRESHOLD ? 'canvas' : 'pdf';
  if (mode !== previewMode) {
    switchPreviewMode(mode);
  } else if (mode === 'canvas') {
    doRender();
  } else {
    refreshPdf();
  }
}

async function openFile(filePath) {
  if (currentFile && editor && currentFile !== filePath) {
    fileCache[currentFile] = editor.getValue();
  }
  const model = await ensureModel(filePath);
  currentFile = filePath;
  if (editor) {
    editor._currentFile = filePath;
    if (editor.getModel() !== model) editor.setModel(model);
  }
  if (!openTabs.includes(filePath)) openTabs.push(filePath);
  localStorage.setItem('typst-editor:last-file', filePath);
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateStatusBar();
  renderCurrentPreview(fileCache[filePath] ?? '');
}

async function switchToTab(filePath) {
  if (filePath === currentFile) return;
  if (editor && currentFile) {
    fileCache[currentFile] = editor.getValue();
  }
  const model = await ensureModel(filePath);
  currentFile = filePath;
  if (editor) {
    editor._currentFile = filePath;
    if (editor.getModel() !== model) editor.setModel(model);
  }
  localStorage.setItem('typst-editor:last-file', filePath);
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateStatusBar();
  renderCurrentPreview(fileCache[filePath] ?? '');
}

async function closeTab(filePath) {
  if (dirtyFiles.has(filePath)) {
    if (!confirm(`文件 ${filePath} 未保存，确定关闭？`)) return;
  }
  const idx = openTabs.indexOf(filePath);
  if (idx === -1) return;
  openTabs.splice(idx, 1);
  const model = fileModels.get(filePath);
  const wasCurrent = filePath === currentFile;
  if (wasCurrent) {
    const next = openTabs.length > 0 ? openTabs[Math.min(idx, openTabs.length - 1)] : null;
    if (next) {
      const m = await ensureModel(next);
      currentFile = next;
      if (editor) {
        editor._currentFile = next;
        if (editor.getModel() !== m) editor.setModel(m);
      }
      localStorage.setItem('typst-editor:last-file', next);
      renderCurrentPreview(fileCache[next] ?? '');
    } else {
      currentFile = null;
      if (editor) {
        editor._currentFile = null;
        editor.setModel(null);
      }
      clearPreview();
    }
  }
  if (model) {
    try { model.dispose(); } catch { /* ignore */ }
  }
  fileModels.delete(filePath);
  delete fileCache[filePath];
  dirtyFiles.delete(filePath);
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateSaveStatus();
  updateStatusBar();
}

function clearPreview() {
  if (pdfViewerEl) pdfViewerEl.close();
  revokePdfUrl();
  const contentEl = document.getElementById('preview-content');
  if (contentEl) contentEl.innerHTML = '';
  renderErrorPanel([]);
  setPreviewLoading(false);
  const statusEl = document.getElementById('preview-status');
  if (statusEl) statusEl.textContent = '未打开文件';
  const pagesEl = document.getElementById('statusbar-pages');
  if (pagesEl) pagesEl.textContent = '';
}

function renderTabs() {
  const scroll = document.getElementById('tabs-scroll');
  if (!scroll) return;
  scroll.innerHTML = '';
  const bar = document.getElementById('tab-bar');
  if (bar) bar.classList.toggle('hidden', openTabs.length <= 1);
  for (const path of openTabs) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (path === currentFile ? ' active' : '') + (dirtyFiles.has(path) ? ' dirty' : '');
    tab.title = path;
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = path.split('/').pop() || path;
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '\u00d7';
    close.title = '关闭';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(path);
    });
    tab.appendChild(name);
    tab.appendChild(close);
    tab.addEventListener('click', () => switchToTab(path));
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(path);
      }
    });
    scroll.appendChild(tab);
  }
}

function updateFileTreeActive() {
  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === currentFile);
  });
}

function updateTreeDots() {
  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    el.classList.toggle('dirty', dirtyFiles.has(el.dataset.path));
  });
}

function updateStatusBar() {
  const fileEl = document.getElementById('statusbar-file');
  if (fileEl) fileEl.textContent = currentFile || '未打开文件';
  const modeEl = document.getElementById('statusbar-mode');
  if (modeEl) modeEl.textContent = previewMode === 'pdf' ? 'PDF' : '画布';
}

function setPreviewLoading(on) {
  const el = document.getElementById('preview-loading');
  if (el) el.classList.toggle('show', on);
}

let toastTimer = null;

function showToast(msg, ms = 2000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

function parseRange(rangeStr) {
  const m = /^(.+):(\d+):(\d+)(?:-(\d+):(\d+))?$/.exec(rangeStr || '');
  if (!m) return null;
  return {
    path: m[1],
    line: Number(m[2]),
    col: Number(m[3]),
    endLine: m[4] ? Number(m[4]) : null,
    endCol: m[5] ? Number(m[5]) : null,
  };
}

function renderErrorPanel(errors) {
  lastErrors = errors || [];
  const panel = document.getElementById('error-panel');
  if (!panel) return;
  const errorsEl = document.getElementById('statusbar-errors');
  panel.innerHTML = '';
  if (lastErrors.length > 0) {
    const title = document.createElement('div');
    title.className = 'error-panel-title';
    title.textContent = `编译错误 (${lastErrors.length})`;
    panel.appendChild(title);
    for (const err of lastErrors) {
      const item = document.createElement('div');
      item.className = 'error-item';
      const parsed = parseRange(err.range);
      const label = document.createElement('span');
      label.className = 'error-loc';
      label.textContent = parsed
        ? `${parsed.path.replace(/^\/+/, '')}:${parsed.line}:${parsed.col}`
        : (err.path || '');
      const text = document.createElement('span');
      text.className = 'error-msg';
      text.textContent = err.message;
      item.appendChild(label);
      item.appendChild(text);
      item.addEventListener('click', () => jumpToError(err, parsed));
      panel.appendChild(item);
    }
    panel.classList.remove('hidden');
    if (errorsEl) {
      errorsEl.textContent = `错误: ${lastErrors.length}`;
      errorsEl.classList.add('has-errors');
    }
  } else {
    panel.classList.add('hidden');
    if (errorsEl) {
      errorsEl.textContent = '';
      errorsEl.classList.remove('has-errors');
    }
  }
}

async function jumpToError(err, parsed) {
  let file = (parsed && parsed.path ? parsed.path : err.path || '').replace(/^\/+/, '');
  if (file === 'worker-main.typ' || file.startsWith('worker-') || file.includes(':')) {
    file = currentFile;
  }
  if (!file) return;
  await openFile(file);
  if (parsed && parsed.line && editor) {
    const pos = { lineNumber: parsed.line, column: Math.max(1, parsed.col) };
    editor.revealPositionInCenter(pos);
    editor.setPosition(pos);
    editor.focus();
  }
}

async function saveFile(filePath) {
  if (!filePath) return false;
  const content = fileCache[filePath] ?? '';
  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = '保存中...';
    statusEl.className = 'saving';
  }
  try {
    await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content }),
    });
    dirtyFiles.delete(filePath);
    updateSaveStatus();
    renderTabs();
    updateTreeDots();
    return true;
  } catch (err) {
    console.error('Save failed:', err);
    if (statusEl) {
      statusEl.textContent = '错误!';
      statusEl.className = 'error';
    }
    return false;
  }
}

async function saveCurrentFile() {
  if (!currentFile) return;
  fileCache[currentFile] = editor.getValue();
  await saveFile(currentFile);
}

async function saveAllFiles() {
  if (currentFile) {
    fileCache[currentFile] = editor.getValue();
  }
  for (const path of [...openTabs]) {
    if (dirtyFiles.has(path)) await saveFile(path);
  }
}

function updateSaveStatus() {
  const saveEl = document.getElementById('save-status');
  if (!saveEl) return;
  if (dirtyFiles.size > 0) {
    saveEl.textContent = `未保存 (${dirtyFiles.size})`;
    saveEl.className = 'dirty';
  } else {
    saveEl.textContent = '已保存';
    saveEl.className = 'saved';
  }
}

async function createNewFile() {
  const name = prompt('新建文件 (例如 hello.typ):');
  if (!name) return;
  const filePath = name.endsWith('.typ') ? name : name + '.typ';

  try {
    await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content: '' }),
    });
    fileCache[filePath] = '';
    syncWorkerFile(filePath, '');
    await loadFileTree();
    openFile(filePath);
  } catch (err) {
    console.error('Create failed:', err);
  }
}

function queueRender(task) {
  renderChain = renderChain.then(task).catch((err) => {
    console.error('[Render] failed:', err);
  });
  return renderChain;
}

function doRender() {
  const contentEl = document.getElementById('preview-content');
  const statusEl = document.getElementById('preview-status');
  if (!typstReady || !editor) return;

  const content = editor.getValue();
  queueRender(async () => {
    setPreviewLoading(true);
    try {
      const vectorData = await compileInWorker(content);
      if (!vectorData || vectorData.__cancelled) return;
      cachedVectorData = vectorData;
      await drawPreview();
      setPreviewLoading(false);
      statusEl.textContent = `就绪 - ${currentFile || '未命名'}`;
      renderErrorPanel(lastWorkerDiagnostics);
      const pagesEl = document.getElementById('statusbar-pages');
      if (pagesEl) {
        const count = getPageCanvasList().length;
        pagesEl.textContent = count > 0 ? `${count} 页` : '';
      }
    } catch (err) {
      setPreviewLoading(false);
      const msg = err?.message || String(err);
      statusEl.textContent = '错误: ' + msg;
      contentEl.innerHTML = `<div class="error-message">${escapeHtml(msg)}</div>`;
      renderErrorPanel([]);
      console.error(err);
    }
  });
}

function getPageCanvasList() {
  return Array.from(document.querySelectorAll('#preview-content > .typst-page.canvas > canvas'));
}

function getVisiblePageIndices() {
  const preview = document.getElementById('preview');
  const contentEl = document.getElementById('preview-content');
  if (!preview || !contentEl) return null;
  const previewRect = preview.getBoundingClientRect();
  const viewTop = previewRect.top;
  const viewBottom = previewRect.bottom;
  const pages = contentEl.querySelectorAll('.typst-page.canvas');
  const indices = [];
  for (let i = 0; i < pages.length; i++) {
    const rect = pages[i].getBoundingClientRect();
    if (rect.bottom >= viewTop - LAZY_MARGIN && rect.top <= viewBottom + LAZY_MARGIN) {
      indices.push(i);
    }
  }
  return indices;
}

function bresenhamDownscale(src, canvas) {
  const sD = src.data;
  const sw = src.width;
  const sh = src.height;
  const dw = canvas.width;
  const dh = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = ctx.createImageData(dw, dh);
  const dD = img.data;
  const stepX = sw / dw;
  const stepY = sh / dh;

  const sx0s = new Int32Array(dw);
  const sx1s = new Int32Array(dw);
  let sx = 0;
  for (let x = 0; x < dw; x++) {
    sx0s[x] = Math.floor(sx);
    sx1s[x] = Math.min(sw - 1, Math.floor(sx + stepX));
    sx += stepX;
  }

  let sy = 0;
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(sy);
    const sy1 = Math.min(sh - 1, Math.floor(sy + stepY));
    const dRow = y * dw;
    for (let x = 0; x < dw; x++) {
      const sx0 = sx0s[x];
      const sx1 = sx1s[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = sy0; j <= sy1; j++) {
        let o = (j * sw + sx0) * 4;
        for (let i = sx0; i <= sx1; i++) {
          r += sD[o];
          g += sD[o + 1];
          b += sD[o + 2];
          a += sD[o + 3];
          o += 4;
        }
      }
      const n = (sx1 - sx0 + 1) * (sy1 - sy0 + 1);
      const o = (dRow + x) * 4;
      dD[o] = r / n;
      dD[o + 1] = g / n;
      dD[o + 2] = b / n;
      dD[o + 3] = a / n;
    }
    sy += stepY;
  }

  ctx.putImageData(img, 0, 0);
}

async function drawPreview(pagesToRender, resetRendered = true) {
  const contentEl = document.getElementById('preview-content');
  if (!contentEl || !cachedVectorData) return;

  if (resetRendered) renderedPageIndices = new Set();

  let renderer;
  try {
    renderer = await getRendererInstance();
  } catch (err) {
    resetRenderer();
    throw new Error('renderer not ready: ' + (err.message || err));
  }
  if (!renderer) throw new Error('renderer not ready');
  const scale = zoomLevel / 100;

  try {
    await renderer.runWithSession(async (session) => {
      renderer.manipulateData({
        renderSession: session,
        action: 'reset',
        data: cachedVectorData,
      });
      const pagesInfo = session.retrievePagesInfo();
      if (pagesInfo.length === 0) throw new Error('No page found in session');

      const canvases = getPageCanvasList();
      const rebuilt = canvases.length !== pagesInfo.length;
      if (rebuilt) {
        contentEl.innerHTML = '';
        for (let i = 0; i < pagesInfo.length; i++) {
          const pageDiv = document.createElement('div');
          pageDiv.className = 'typst-page canvas';
          pageDiv.appendChild(document.createElement('canvas'));
          contentEl.appendChild(pageDiv);
        }
        renderedPageIndices = new Set();
      }

      const pageCanvases = getPageCanvasList();
      for (let i = 0; i < pagesInfo.length; i++) {
        const canvas = pageCanvases[i];
        canvas.dataset.ptW = pagesInfo[i].width;
        canvas.dataset.ptH = pagesInfo[i].height;
      }
      performZoomResize(zoomLevel);

      if (pagesToRender === undefined) {
        const visible = getVisiblePageIndices();
        pagesToRender = visible && visible.length > 0 ? visible : pagesInfo.map((_, i) => i);
      }

      for (const i of pagesToRender) {
        if (i < 0 || i >= pagesInfo.length) continue;
        if (renderedPageIndices.has(i)) continue;
        const page = pagesInfo[i];
        const canvas = pageCanvases[i];
        const dstW = Math.max(1, Math.round(page.width * scale));
        const dstH = Math.max(1, Math.round(page.height * scale));

        canvas.width = dstW;
        canvas.height = dstH;

        const src = getHiddenCanvas();
        src.width = Math.max(1, Math.round(page.width * scale * 2));
        src.height = Math.max(1, Math.round(page.height * scale * 2));
        const srcCtx = src.getContext('2d', { willReadFrequently: true });
        if (!srcCtx) throw new Error('canvas context is null');

        await new Promise((resolve) => requestAnimationFrame(resolve));
        await renderer.renderCanvas({
          renderSession: session,
          canvas: srcCtx,
          pageOffset: page.pageOffset,
          pixelPerPt: src.width / page.width,
          backgroundColor: '#ffffff',
        });

        bresenhamDownscale(srcCtx.getImageData(0, 0, src.width, src.height), canvas);
        renderedPageIndices.add(i);
      }
    });
  } catch (err) {
    resetRenderer();
    throw err;
  }

  updateZoomLayout();
}

function scheduleLazyRender() {
  clearTimeout(lazyTimer);
  lazyTimer = setTimeout(() => {
    if (!cachedVectorData) return;
    const visible = getVisiblePageIndices();
    if (!visible || visible.length === 0) return;
    const pending = visible.filter((i) => !renderedPageIndices.has(i));
    if (pending.length > 0) {
      queueRender(() => drawPreview(pending, false));
    }
  }, 120);
}

function setupLazyRender() {
  const preview = document.getElementById('preview');
  if (!preview) return;
  preview.addEventListener(
    'scroll',
    () => {
      if (!cachedVectorData) return;
      scheduleLazyRender();
    },
    { passive: true }
  );
}

function scheduleZoomRender() {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    queueRender(() => {
      if (cachedVectorData) return drawPreview();
    });
  }, 100);
}

function applyZoomResize(zoom = zoomLevel) {
  captureZoomAnchor();
  zoomLevel = zoom;
  performZoomResize(zoom);
  scheduleZoomRender();
  updateZoomLayout(() => {
    restoreZoomScroll();
  });
}

function performZoomResize(zoom) {
  const scale = zoom / 100;
  const previewEl = document.getElementById('preview');
  if (previewEl) {
    previewEl.style.setProperty('--preview-pad', `${20 * scale}px`);
    previewEl.style.setProperty('--page-gap', `${25 * scale}px`);
  }
  const canvases = getPageCanvasList();
  for (const canvas of canvases) {
    const ptW = parseFloat(canvas.dataset.ptW);
    const ptH = parseFloat(canvas.dataset.ptH);
    if (!ptW || !ptH) continue;
    const cssW = Math.max(1, Math.round(ptW * scale));
    const cssH = Math.max(1, Math.round(ptH * scale));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.dataset.cssW = cssW;
    canvas.dataset.cssH = cssH;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function captureZoomAnchor() {
  const preview = document.getElementById('preview');
  if (!preview) return;
  const rect = preview.getBoundingClientRect();
  const cx = rect.left + preview.clientWidth / 2;
  const cy = rect.top + preview.clientHeight / 2;
  const canvases = getPageCanvasList();
  let top = null;
  let left = null;
  for (const canvas of canvases) {
    const r = canvas.getBoundingClientRect();
    if (top === null && r.bottom >= cy) {
      top = r.top - rect.top + preview.scrollTop + Math.max(0, cy - r.top);
    }
    if (left === null && r.left <= cx && r.right >= cx) {
      left = r.left - rect.left + preview.scrollLeft + (cx - r.left);
    }
    if (top !== null && left !== null) break;
  }
  if (canvases.length) {
    const last = canvases[canvases.length - 1].getBoundingClientRect();
    if (top === null) top = last.bottom - rect.top + preview.scrollTop;
    if (left === null) left = last.left - rect.left + preview.scrollLeft;
  }
  if (top === null) top = preview.scrollTop + preview.clientHeight / 2;
  if (left === null) left = preview.scrollLeft + preview.clientWidth / 2;
  zoomAnchor = {
    zoom: zoomLevel,
    top,
    left,
    clientWidth: preview.clientWidth,
    clientHeight: preview.clientHeight,
  };
}

function restoreZoomScroll() {
  const preview = document.getElementById('preview');
  if (!preview || !zoomAnchor) return;
  const factor = zoomLevel / zoomAnchor.zoom;
  preview.scrollTop = Math.max(0, Math.round(zoomAnchor.top * factor - zoomAnchor.clientHeight / 2));
  preview.scrollLeft = Math.max(0, Math.round(zoomAnchor.left * factor - zoomAnchor.clientWidth / 2));
  zoomAnchor = null;
}

function updateZoomLayout(done) {
  const zoomInput = document.querySelector('#zoom-level input');
  if (zoomInput) {
    zoomInput.value = zoomLevel;
    zoomInput.classList.toggle('zoom-is-default', zoomLevel === 100);
  }
  if (done) {
    done();
  }
}

function setupZoom() {
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    applyZoomResize(Math.min(300, zoomLevel + 10));
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    applyZoomResize(Math.max(25, zoomLevel - 10));
  });

  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    applyZoomResize(100);
  });

  const zoomInput = document.querySelector('#zoom-level input');
  if (zoomInput) {
    zoomInput.addEventListener('change', () => {
      const val = parseInt(zoomInput.value, 10);
      if (isNaN(val)) {
        zoomInput.value = zoomLevel;
        return;
      }
      applyZoomResize(Math.min(300, Math.max(25, val)));
    });
    zoomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') zoomInput.blur();
    });
  }
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
      const editorHeight = Math.max(availableHeight * 0.2, Math.min(availableHeight * 0.8, availableHeight * editorRatio));

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
      const editorWidth = Math.max(availableWidth * 0.2, Math.min(availableWidth * 0.8, availableWidth * editorRatio));
      editorContainer.style.flex = `0 0 ${editorWidth}px`;
      previewContainer.style.flex = `1`;
    }
    if (editor) editor.layout();
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
    if (size >= 10 && size <= 40 && editor) {
      editor.updateOptions({ fontSize: size });
    }
  });
}

async function exportSVG() {
  if (!typstReady || !editor) return;
  try {
    let data = cachedVectorData;
    if (!data || data.__cancelled) {
      const res = await compileInWorker(editor.getValue(), 'vector');
      if (!res || res.__cancelled) throw new Error('编译已取消');
      data = res;
    }
    const renderer = await getRendererInstance();
    const svg = await renderer.runWithSession(async (session) => {
      renderer.manipulateData({
        renderSession: session,
        action: 'reset',
        data,
      });
      return session.renderSvg({});
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, (currentFile || 'document').replace(/\.typ$/, '') + '.svg');
    showToast('已导出 SVG');
  } catch (err) {
    resetRenderer();
    console.error('Export SVG failed:', err);
    showToast('导出 SVG 失败');
  }
}

async function exportPDF() {
  if (!typstReady || !editor) return;
  try {
    const pdfData = await compileInWorker(editor.getValue(), 'pdf');
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    downloadBlob(blob, (currentFile || 'document').replace(/\.typ$/, '') + '.pdf');
    showToast('已导出 PDF');
  } catch (err) {
    console.error('Export PDF failed:', err);
    showToast('导出 PDF 失败');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function suppressPdfJsWarnings() {
  const origWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0] ?? '').includes('may override manually set AppOptions')) return;
    origWarn(...args);
  };
}

function getPdfViewerElement() {
  if (pdfViewerEl) return Promise.resolve(pdfViewerEl);
  if (!pdfModulePromise) {
    pdfModulePromise = import('../pdf.js-element/pdf-viewer-element.mjs').then(() => {
      suppressPdfJsWarnings();
      const container = document.getElementById('pdf-viewer');
      container.querySelectorAll('pdf-viewer-element').forEach((old) => old.remove());
      const el = document.createElement('pdf-viewer-element');
      el.setAttribute('ui-style', 'old');
      el.setAttribute('lang', 'zh-CN');
      el.setAttribute('worker-src', '/pdf.js-element/pdf.worker.mjs');
      el.setAttribute('c-map-url', '/pdf.js-element/cmaps/');
      el.setAttribute('standard-font-data-url', '/pdf.js-element/standard_fonts/');
      el.setAttribute('wasm-url', '/pdf.js-element/wasm/');
      el.setAttribute('sandbox-bundle-src', '/pdf.js-element/pdf.sandbox.mjs');
      el.setAttribute('l10n-url', '/pdf.js-element/locale/');
      container.appendChild(el);
      pdfViewerEl = el;
      el.addEventListener('pdfjs-documentloaded', () => {
        const statusEl = document.getElementById('preview-status');
        statusEl.textContent = `PDF - ${currentFile || '未命名'}`;
        renderErrorPanel(lastWorkerDiagnostics);
        setPreviewLoading(false);
        const pagesEl = document.getElementById('statusbar-pages');
        const count = pdfViewerEl && typeof pdfViewerEl.pagesCount === 'number' ? pdfViewerEl.pagesCount : 0;
        if (pagesEl) pagesEl.textContent = count > 0 ? `${count} 页` : '';
      });
      el.addEventListener('pdfjs-documentloadfailed', () => {
        const statusEl = document.getElementById('preview-status');
        statusEl.textContent = 'PDF 加载失败';
        setPreviewLoading(false);
      });
      return el;
    });
  }
  return pdfModulePromise;
}

function revokePdfUrl() {
  if (pdfObjectUrl) {
    URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = null;
  }
}

async function refreshPdf() {
  if (!editor) return;
  const statusEl = document.getElementById('preview-status');
  statusEl.textContent = '正在编译 PDF...';
  setPreviewLoading(true);
  try {
    const pdfData = await compileInWorker(editor.getValue(), 'pdf');
    if (!pdfData || pdfData.__cancelled) return;
    revokePdfUrl();
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    pdfObjectUrl = URL.createObjectURL(blob);
    const viewer = await getPdfViewerElement();
    await viewer.open(pdfObjectUrl);
  } catch (err) {
    setPreviewLoading(false);
    const msg = err?.message || String(err);
    statusEl.textContent = 'PDF 错误: ' + msg;
    renderErrorPanel([]);
    console.error(err);
  }
}

function schedulePdfRefresh() {
  clearTimeout(pdfTimer);
  pdfTimer = setTimeout(() => refreshPdf(), 1000);
}

function switchPreviewMode(mode) {
  if (mode === previewMode) return;
  previewMode = mode;
  const containerEl = document.getElementById('preview-container');
  const previewEl = document.getElementById('preview');
  if (containerEl) {
    containerEl.classList.toggle('pdf-mode', mode === 'pdf');
    containerEl.classList.toggle('canvas-mode', mode === 'canvas');
  }
  if (previewEl) {
    previewEl.classList.toggle('pdf-mode', mode === 'pdf');
    previewEl.classList.toggle('canvas-mode', mode === 'canvas');
  }
  updateStatusBar();
  if (mode === 'canvas') {
    if (pdfViewerEl) pdfViewerEl.close();
    revokePdfUrl();
    doRender();
  } else {
    refreshPdf();
  }
}

async function main() {
  window.monaco = monaco;

  await initEditor(monaco);
  setupDivider();
  setupFontSize();
  setupZoom();
  setupLazyRender();

  registerLspFeatures(monaco, editor);

  document.getElementById('btn-new-file').addEventListener('click', createNewFile);
  document.getElementById('btn-save').addEventListener('click', saveAllFiles);
  document.getElementById('btn-export-svg').addEventListener('click', exportSVG);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  const refreshBtn = document.getElementById('btn-refresh-tree');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadFileTree());
  updateSaveStatus();
  updateStatusBar();
  renderTabs();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveAllFiles();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'e') {
      e.preventDefault();
      exportSVG();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'p') {
      e.preventDefault();
      exportPDF();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'c') {
      e.preventDefault();
      if (previewMode === 'canvas') {
        doRender();
      } else {
        refreshPdf();
      }
    }
  });

  const previewEl = document.getElementById('preview');
  if (previewEl) {
    previewEl.addEventListener('wheel', (e) => {
      if (previewMode === 'canvas' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        applyZoomResize(Math.min(300, Math.max(25, zoomLevel + (e.deltaY < 0 ? 5 : -5))));
      }
    }, { passive: false });
  }

  initProject('/main.typ').catch(e =>
    console.warn('[TypstProject] Init failed, LSP features disabled:', e)
  );

  await initTypst();
  await loadFileTree();

  const defaultFile = 'main.typ';
  const exists = await fileExists(defaultFile);
  if (!exists) {
    await saveFileToServer(defaultFile, DEFAULT_CONTENT);
    await loadFileTree();
  }
  const lastFile = localStorage.getItem('typst-editor:last-file');
  let target = defaultFile;
  if (lastFile && lastFile !== defaultFile && (await fileExists(lastFile))) {
    target = lastFile;
  }
  openFile(target);

  autoSaveTimer = setInterval(() => {
    if (dirtyFiles.size > 0) {
      saveAllFiles().catch(e => console.warn('[AutoSave] failed:', e));
    }
  }, 5000);

  window.addEventListener('beforeunload', (e) => {
    if (dirtyFiles.size > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    revokePdfUrl();
    destroyProject();
  });
}

main();
