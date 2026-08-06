import { session } from './state.js';
import {
  compileInWorker,
  getLastDiagnostics,
  restartCompilerWorker,
  syncWorkerFile,
} from './compiler.js';
import { syncFile, isReady as isWasmReady } from './typst-project.js';
import { escapeHtml, downloadBlob } from './utils.js';
import { translateMessage } from './error-translations.js';
import { updateStatusBar } from './ui.js';

const LAZY_MARGIN = 200;
const LARGE_FILE_THRESHOLD = 100000;

let hiddenCanvas = null;
let cachedVectorData = null;
let renderChain = Promise.resolve();
let zoomTimer = null;
let lazyTimer = null;
let zoomAnchor = null;
let renderedPageIndices = new Set();

let rendererPromise = null;
let pdfViewerEl = null;
let pdfObjectUrl = null;
let pdfTimer = null;
let pdfModulePromise = null;
let toastTimer = null;
let errorJumpHandler = null;

export function setErrorJumpHandler(fn) {
  errorJumpHandler = fn;
}

function getHiddenCanvas() {
  if (!hiddenCanvas) hiddenCanvas = document.createElement('canvas');
  return hiddenCanvas;
}

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
      const { createTypstRenderer } = await import(
        '@myriaddreamin/typst.ts/dist/esm/renderer.mjs'
      );
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

export function setPreviewLoading(on) {
  const el = document.getElementById('preview-loading');
  if (el) el.classList.toggle('show', on);
}

export function showToast(msg, ms = 2000) {
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

export function renderErrorPanel(errors, onJump) {
  const panel = document.getElementById('error-panel');
  if (!panel) return;
  const errorsEl = document.getElementById('statusbar-errors');
  panel.innerHTML = '';
  if (errors && errors.length > 0) {
    const title = document.createElement('div');
    title.className = 'error-panel-title';
    title.textContent = `编译错误 (${errors.length})`;
    panel.appendChild(title);
    for (const err of errors) {
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
      const translated = translateMessage(err.message);
      text.textContent = translated;
      item.appendChild(label);
      item.appendChild(text);
      if (translated !== err.message) {
        const orig = document.createElement('span');
        orig.className = 'error-msg-orig';
        orig.textContent = err.message;
        item.appendChild(orig);
      }
      if (onJump) item.addEventListener('click', () => onJump(err, parsed));
      panel.appendChild(item);
    }
    panel.classList.remove('hidden');
    if (errorsEl) {
      errorsEl.textContent = `错误: ${errors.length}`;
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

export function clearPreview() {
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

function queueRender(task) {
  renderChain = renderChain.then(task).catch((err) => {
    console.error('[Render] failed:', err);
  });
  return renderChain;
}

export function doRender() {
  const contentEl = document.getElementById('preview-content');
  const statusEl = document.getElementById('preview-status');
  if (!session.typstReady || !session.editor) return;

  const content = session.editor.getValue();
  queueRender(async () => {
    setPreviewLoading(true);
    try {
      const vectorData = await compileInWorker(content);
      if (!vectorData || vectorData.__cancelled) return;
      cachedVectorData = vectorData;
      await drawPreview();
      setPreviewLoading(false);
      statusEl.textContent = `就绪 - ${session.currentFile || '未命名'}`;
      renderErrorPanel(getLastDiagnostics(), errorJumpHandler);
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
      renderErrorPanel(getLastDiagnostics(), errorJumpHandler);
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
  const scale = session.zoomLevel / 100;

  try {
    await renderer.runWithSession(async (sessionHandle) => {
      renderer.manipulateData({
        renderSession: sessionHandle,
        action: 'reset',
        data: cachedVectorData,
      });
      const pagesInfo = sessionHandle.retrievePagesInfo();
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
      performZoomResize(session.zoomLevel);

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
          renderSession: sessionHandle,
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

export function setupLazyRender() {
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

function applyZoomResize(zoom = session.zoomLevel) {
  captureZoomAnchor();
  session.zoomLevel = zoom;
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
    zoom: session.zoomLevel,
    top,
    left,
    clientWidth: preview.clientWidth,
    clientHeight: preview.clientHeight,
  };
}

function restoreZoomScroll() {
  const preview = document.getElementById('preview');
  if (!preview || !zoomAnchor) return;
  const factor = session.zoomLevel / zoomAnchor.zoom;
  preview.scrollTop = Math.max(0, Math.round(zoomAnchor.top * factor - zoomAnchor.clientHeight / 2));
  preview.scrollLeft = Math.max(0, Math.round(zoomAnchor.left * factor - zoomAnchor.clientWidth / 2));
  zoomAnchor = null;
}

function updateZoomLayout(done) {
  const zoomInput = document.querySelector('#zoom-level input');
  if (zoomInput) {
    zoomInput.value = session.zoomLevel;
    zoomInput.classList.toggle('zoom-is-default', session.zoomLevel === 100);
  }
  if (done) {
    done();
  }
}

export function setupZoom() {
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    applyZoomResize(Math.min(300, session.zoomLevel + 10));
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    applyZoomResize(Math.max(25, session.zoomLevel - 10));
  });

  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    applyZoomResize(100);
  });

  const zoomInput = document.querySelector('#zoom-level input');
  if (zoomInput) {
    zoomInput.addEventListener('change', () => {
      const val = parseInt(zoomInput.value, 10);
      if (isNaN(val)) {
        zoomInput.value = session.zoomLevel;
        return;
      }
      applyZoomResize(Math.min(300, Math.max(25, val)));
    });
    zoomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') zoomInput.blur();
    });
  }
}

export function handlePreviewWheel(e) {
  if (session.previewMode === 'canvas' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    applyZoomResize(Math.min(300, Math.max(25, session.zoomLevel + (e.deltaY < 0 ? 5 : -5))));
  }
}

export function renderCurrentPreview(content) {
  clearTimeout(zoomTimer);
  zoomAnchor = null;
  session.zoomLevel = 100;
  updateZoomLayout();
  const previewEl = document.getElementById('preview');
  if (previewEl) previewEl.scrollTop = 0;
  if (session.currentFile) {
    syncWorkerFile(session.currentFile, content || '');
    if (isWasmReady()) {
      syncFile(session.currentFile, content || '').catch((e) =>
        console.warn('[TypstProject] Sync failed:', e)
      );
    }
  }
  restartCompilerWorker(content || '');
  const mode = (content || '').length > LARGE_FILE_THRESHOLD ? 'canvas' : 'pdf';
  if (mode !== session.previewMode) {
    switchPreviewMode(mode);
  } else if (mode === 'canvas') {
    doRender();
  } else {
    refreshPdf();
  }
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
      el.setAttribute('worker-src', '/pdf-worker-shim.mjs');
      el.setAttribute('c-map-url', '/pdf.js-element/cmaps/');
      el.setAttribute('standard-font-data-url', '/pdf.js-element/standard_fonts/');
      el.setAttribute('wasm-url', '/pdf.js-element/wasm/');
      el.setAttribute('sandbox-bundle-src', '/pdf.js-element/pdf.sandbox.mjs');
      el.setAttribute('l10n-url', '/pdf.js-element/locale/');
      container.appendChild(el);
      pdfViewerEl = el;
      el.addEventListener('pdfjs-documentloaded', () => {
        const statusEl = document.getElementById('preview-status');
        statusEl.textContent = `PDF - ${session.currentFile || '未命名'}`;
        renderErrorPanel(getLastDiagnostics(), errorJumpHandler);
        setPreviewLoading(false);
        const pagesEl = document.getElementById('statusbar-pages');
        const count =
          pdfViewerEl && typeof pdfViewerEl.pagesCount === 'number' ? pdfViewerEl.pagesCount : 0;
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

export function cleanupPreview() {
  revokePdfUrl();
}

export async function refreshPdf() {
  if (!session.editor) return;
  const statusEl = document.getElementById('preview-status');
  statusEl.textContent = '正在编译 PDF...';
  setPreviewLoading(true);
  try {
    const pdfData = await compileInWorker(session.editor.getValue(), 'pdf');
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
    renderErrorPanel(getLastDiagnostics(), errorJumpHandler);
    console.error(err);
  }
}

export function schedulePdfRefresh() {
  clearTimeout(pdfTimer);
  pdfTimer = setTimeout(() => refreshPdf(), 1000);
}

export function switchPreviewMode(mode) {
  if (mode === session.previewMode) return;
  session.previewMode = mode;
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

export async function exportSVG() {
  if (!session.typstReady || !session.editor) return;
  try {
    let data = cachedVectorData;
    if (!data || data.__cancelled) {
      const res = await compileInWorker(session.editor.getValue(), 'vector');
      if (!res || res.__cancelled) throw new Error('编译已取消');
      data = res;
    }
    const renderer = await getRendererInstance();
    const svg = await renderer.runWithSession(async (sessionHandle) => {
      renderer.manipulateData({
        renderSession: sessionHandle,
        action: 'reset',
        data,
      });
      return sessionHandle.renderSvg({});
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, (session.currentFile || 'document').replace(/\.typ$/, '') + '.svg');
    showToast('已导出 SVG');
  } catch (err) {
    resetRenderer();
    console.error('Export SVG failed:', err);
    showToast('导出 SVG 失败');
  }
}

export async function exportPDF() {
  if (!session.typstReady || !session.editor) return;
  try {
    const pdfData = await compileInWorker(session.editor.getValue(), 'pdf');
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    downloadBlob(blob, (session.currentFile || 'document').replace(/\.typ$/, '') + '.pdf');
    showToast('已导出 PDF');
  } catch (err) {
    console.error('Export PDF failed:', err);
    showToast('导出 PDF 失败');
  }
}
