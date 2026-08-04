import { registerTypstLanguage, registerTypstSnippets } from './typst-lang';
import { initTextMateGrammar, registerTextMateLanguage } from './textmate';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/dist/esm/renderer.mjs';
import * as monaco from 'monaco-editor';
import '../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { initProject, syncFile, isReady as isWasmReady, destroyProject } from './typst-project.js';
import { registerLspFeatures } from './lsp-adapter.js';

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
let isDirty = false;
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
      const { id, ok, data, error, cancelled } = event.data;
      const pending = compilerPending.get(id);
      if (!pending) return;
      compilerPending.delete(id);
      if (cancelled) {
        pending.resolve({ __cancelled: true });
      } else if (ok) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || 'compile failed'));
      }
    });
    compilerWorker.addEventListener('error', (event) => {
      for (const pending of compilerPending.values()) {
        pending.reject(new Error(event.message || 'compiler worker error'));
      }
      compilerPending.clear();
    });
  }
  return compilerWorker;
}

function compileInWorker(mainContent, format = 'vector') {
  const id = ++compilerRequestId;
  return new Promise((resolve, reject) => {
    compilerPending.set(id, { resolve, reject });
    getCompilerWorker().postMessage({ id, mainContent, format });
  });
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
    window.packageCache = new Map();

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
let rendererInstance = null;

function getRendererInstance() {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const renderer = createTypstRenderer();
      await renderer.init({
        getModule: () =>
          fetch('/typst-wasm/typst_ts_renderer_bg.wasm').then((r) => r.arrayBuffer()),
      });
      rendererInstance = renderer;
      return renderer;
    })();
  }
  return rendererPromise;
}

function resetRenderer() {
  rendererPromise = null;
  rendererInstance = null;
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
    isDirty = true;
    const saveEl = document.getElementById('save-status');
    if (saveEl.textContent !== '保存中...') {
      saveEl.textContent = '未保存';
      saveEl.className = 'dirty';
    }

    if (isWasmReady()) {
      syncFile(currentFile, editor.getValue()).catch(e =>
        console.warn('[TypstProject] Sync failed:', e)
      );
    }

    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => doRender(), 1000);
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

      el.addEventListener('click', () => {
        const collapsed = el.classList.toggle('collapsed');
        child.style.display = collapsed ? 'none' : '';
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
    if (currentFile === oldPath) {
      currentFile = newPath;
      if (editor) editor._currentFile = newPath;
    }
    delete fileCache[oldPath];
    await loadFileTree();
    if (currentFile === newPath) openFile(newPath);
  } catch (err) {
    console.error('Rename failed:', err);
  }
}

async function deleteFile(filePath) {
  if (!confirm(`确定删除 ${filePath}？`)) return;
  try {
    await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
    delete fileCache[filePath];
    if (currentFile === filePath) {
      currentFile = null;
      if (editor) editor.setValue('');
    }
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

async function openFile(filePath) {
  if (currentFile && editor) {
    fileCache[currentFile] = editor.getValue();
    await saveCurrentFile();
  }

  currentFile = filePath;
  isDirty = false;
  if (editor) editor._currentFile = filePath;
  let content;

  if (fileCache[filePath] !== undefined) {
    content = fileCache[filePath];
  } else {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      content = data.content;
      fileCache[filePath] = content;
    } catch {
      content = '';
      fileCache[filePath] = content;
    }
  }

  if (editor) {
    const ext = filePath.split('.').pop();
    const lang = ext === 'typ' ? 'typst' : ext;
    const model = editor.getModel()?.uri?.toString() === filePath
      ? editor.getModel()
      : undefined;
    if (model) {
      model.setValue(content || '');
    } else {
      const newModel = window.monaco?.editor?.createModel?.(content || '', lang);
      if (newModel) editor.setModel(newModel);
    }
  }

  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === filePath);
  });

  if (isWasmReady()) {
    syncFile(filePath, content || '').catch(e =>
      console.warn('[TypstProject] Sync failed:', e)
    );
  }

  doRender();
}

async function saveCurrentFile() {
  if (!currentFile) return;
  const content = fileCache[currentFile] ?? editor.getValue();
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = '保存中...';
  statusEl.className = 'saving';
  try {
    await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: currentFile, content }),
    });
    statusEl.textContent = '已保存';
    statusEl.className = 'saved';
    isDirty = false;
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);
  } catch (err) {
    console.error('Save failed:', err);
    statusEl.textContent = '错误!';
    statusEl.className = 'error';
  }
}

async function saveAllFiles() {
  if (currentFile) {
    fileCache[currentFile] = editor.getValue();
  }
  await saveCurrentFile();
}

async function createNewFile() {
  const name = prompt('New file name (e.g. hello.typ):');
  if (!name) return;
  const filePath = name.endsWith('.typ') ? name : name + '.typ';

  try {
    await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, content: '' }),
    });
    fileCache[filePath] = '';
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
    try {
      const vectorData = await compileInWorker(content);
      if (!vectorData || vectorData.__cancelled) return;
      cachedVectorData = vectorData;
      await drawPreview();
      statusEl.textContent = `就绪 - ${currentFile || '未命名'}`;
    } catch (err) {
      const msg = err?.message || String(err);
      statusEl.textContent = '错误: ' + msg;
      contentEl.innerHTML = `<div class="error-message">${escapeHtml(msg)}</div>`;
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
    if (canvases.length !== pagesInfo.length) {
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
      const cssW = Math.max(1, Math.round(pagesInfo[i].width * scale));
      const cssH = Math.max(1, Math.round(pagesInfo[i].height * scale));
      canvas.dataset.ptW = pagesInfo[i].width;
      canvas.dataset.ptH = pagesInfo[i].height;
      if (canvas.dataset.cssW != cssW || canvas.dataset.cssH != cssH) {
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.dataset.cssW = cssW;
        canvas.dataset.cssH = cssH;
      }
    }

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

let zoomTaskStack = [];
let zoomTaskRunning = false;

function applyZoomResize(zoom = zoomLevel) {
  zoomTaskStack.push(zoom);
  drainZoomTaskStack();
}

function drainZoomTaskStack() {
  if (zoomTaskRunning || zoomTaskStack.length === 0) return;
  const target = zoomTaskStack[zoomTaskStack.length - 1];
  zoomTaskStack = [];
  zoomTaskRunning = true;

  captureZoomAnchor();
  zoomLevel = target;
  performZoomResize(target);
  scheduleZoomRender();
  updateZoomLayout(() => {
    zoomTaskRunning = false;
    drainZoomTaskStack();
  });
}

function performZoomResize(zoom) {
  const scale = zoom / 100;
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
  zoomAnchor = {
    zoom: zoomLevel,
    top: preview.scrollTop,
    left: preview.scrollLeft,
    clientWidth: preview.clientWidth,
    clientHeight: preview.clientHeight,
  };
}

function updateZoomLayout(done) {
  const preview = document.getElementById('preview');
  const zoomLabel = document.getElementById('zoom-level');

  if (zoomLabel) {
    zoomLabel.textContent = `${zoomLevel}%`;
  }

  function finish() {
    if (done) done();
  }

  if (preview) {
    requestAnimationFrame(() => {
      if (preview.scrollHeight === 0) {
        zoomAnchor = null;
        finish();
        return;
      }
      if (zoomAnchor) {
        const factor = zoomLevel / zoomAnchor.zoom;
        const anchorY = zoomAnchor.top + zoomAnchor.clientHeight / 2;
        const anchorX = zoomAnchor.left + zoomAnchor.clientWidth / 2;
        preview.scrollTop = Math.max(0, Math.round(anchorY * factor - zoomAnchor.clientHeight / 2));
        preview.scrollLeft = Math.max(0, Math.round(anchorX * factor - zoomAnchor.clientWidth / 2));
        zoomAnchor = null;
      }
      finish();
    });
  } else {
    finish();
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
  } catch (err) {
    resetRenderer();
    console.error('Export SVG failed:', err);
  }
}

async function exportPDF() {
  if (!typstReady || !editor) return;
  try {
    const pdfData = await compileInWorker(editor.getValue(), 'pdf');
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    downloadBlob(blob, (currentFile || 'document').replace(/\.typ$/, '') + '.pdf');
  } catch (err) {
    console.error('Export PDF failed:', err);
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

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveAllFiles();
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
      doRender();
    }
  });

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
  openFile(defaultFile);

  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
    destroyProject();
  });
}

main();
