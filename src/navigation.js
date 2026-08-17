import { session } from './state.js';
import { getProject, isReady } from './typst-project.js';
import { getPdfViewerElementRef } from './preview.js';
import { getEntryFile, isEntryUsable } from './entry.js';

let cursorTimer = null;
let lastJumpKey = '';

function toVfsPath(p) {
  return p.startsWith('/') ? p : '/' + p;
}

function viewerScale(viewer) {
  try {
    const v = viewer?.pdfViewer;
    if (v && typeof v.currentScale === 'number' && v.currentScale > 0) return v.currentScale;
  } catch {
    /* ignore */
  }
  return null;
}

function pageElFromEvent(e) {
  return e.target && typeof e.target.closest === 'function'
    ? e.target.closest('.page[data-page-number]')
    : null;
}

function pagePointFromEvent(e, pageEl) {
  const viewer = getPdfViewerElementRef();
  const scale = viewerScale(viewer);
  if (!scale) return null;
  const rect = pageEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (e.clientX - rect.left) / scale,
    y: (e.clientY - rect.top) / scale,
  };
}

export async function handlePdfPreviewClick(e) {
  const pageEl = pageElFromEvent(e);
  if (!pageEl) return;
  const pageNum = parseInt(pageEl.dataset.pageNumber, 10);
  if (!pageNum || !isReady()) return;
  const pt = pagePointFromEvent(e, pageEl);
  if (!pt) return;
  const project = getProject();
  try {
    const jump = await project.clickJump(pageNum - 1, pt.x, pt.y);
    if (!jump) return;
    if (jump.kind === 'source') {
      const { openFile } = await import('./editor-core.js');
      let file = jump.file.replace(/^\/+/, '');
      if (file === 'worker-main.typ' || file.startsWith('worker-')) {
        file = session.currentFile;
      }
      if (!file) return;
      await openFile(file);
      if (session.editor) {
        const pos = { lineNumber: jump.line, column: Math.max(1, jump.column) };
        session.editor.revealPositionInCenter(pos);
        session.editor.setPosition(pos);
        session.editor.focus();
      }
    } else if (jump.kind === 'url') {
      window.open(jump.url, '_blank', 'noopener');
    }
  } catch (err) {
    console.warn('[Nav] clickJump failed:', err);
  }
}

export function sourceOffsetForPosition(source, lineNumber, column) {
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset + (column || 1) - 1;
}

export async function scrollPreviewToPosition(filePath, source, lineNumber, column) {
  if (!isReady()) return;
  const offset = sourceOffsetForPosition(source, lineNumber, column);
  const project = getProject();
  try {
    const jump = await project.jumpFromCursor(toVfsPath(filePath), source, offset);
    if (!jump) return;
    const viewer = getPdfViewerElementRef();
    if (!viewer) return;
    const pageNumber = jump.page + 1;
    if (pageNumber >= 1 && pageNumber <= viewer.pagesCount) {
      if (typeof viewer.page === 'number') viewer.page = pageNumber;
    }
  } catch (err) {
    console.warn('[Nav] jumpFromCursor failed:', err);
  }
}

export async function scrollPreviewToCursor() {
  if (!isReady() || !session.editor) return;
  const model = session.editor.getModel();
  if (!model) return;
  const pos = session.editor.getPosition();
  if (!pos) return;

  const source = model.getValue();
  const offset = sourceOffsetForPosition(source, pos.lineNumber, pos.column);

  const filePath = session.currentFile || 'main.typ';
  const jumpKey = `${filePath}:${offset}`;
  if (jumpKey === lastJumpKey) return;
  lastJumpKey = jumpKey;

  await scrollPreviewToPosition(filePath, source, pos.lineNumber, pos.column);
}

export function scheduleCursorJump() {
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    scrollPreviewToCursor();
  }, 300);
}

export function resetCursorJumpKey() {
  lastJumpKey = '';
}

export function setupPdfNavigation() {
  const container = document.getElementById('pdf-viewer');
  if (!container) return;
  container.addEventListener('click', (e) => {
    handlePdfPreviewClick(e);
  });
}

export { isEntryUsable, getEntryFile };
