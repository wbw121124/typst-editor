import { session } from './state.js';
import { parseRange } from './utils.js';
import { fetchFile, writeFile } from './file-api.js';
import { renderCurrentPreview, clearPreview } from './preview.js';
import { updateFileTreeActive, updateTreeDots, updateSaveStatus, updateStatusBar, showConfirm } from './ui.js';
import { snapshotOnSave, clearDraftAfterSave, checkDraftOnOpen, renderTimelinePanel } from './timeline.js';

const CURSOR_KEY = 'typst-editor:cursor-positions';
const cursorPositions = loadCursorPositions();

function loadCursorPositions() {
  try {
    const raw = localStorage.getItem(CURSOR_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    const map = new Map();
    for (const key of Object.keys(obj)) {
      if (obj[key] && Array.isArray(obj[key].selections)) map.set(key, obj[key]);
    }
    return map;
  } catch {
    return new Map();
  }
}

function persistCursorPositions() {
  try {
    localStorage.setItem(CURSOR_KEY, JSON.stringify(Object.fromEntries(cursorPositions)));
  } catch {
    /* ignore */
  }
}

function saveEditorState(filePath) {
  if (!session.editor) return;
  const selections = session.editor.getSelections();
  cursorPositions.set(filePath, {
    selections: selections.map((s) => ({
      startLineNumber: s.startLineNumber,
      startColumn: s.startColumn,
      endLineNumber: s.endLineNumber,
      endColumn: s.endColumn,
    })),
    scrollTop: session.editor.getScrollTop(),
    scrollLeft: session.editor.getScrollLeft(),
  });
  persistCursorPositions();
}

function restoreEditorState(filePath) {
  const saved = cursorPositions.get(filePath);
  if (!saved || !session.editor) return;
  if (Array.isArray(saved.selections) && saved.selections.length > 0) {
    const { Selection } = window.monaco;
    session.editor.setSelections(
      saved.selections.map(
        (s) => new Selection(s.startLineNumber, s.startColumn, s.endLineNumber, s.endColumn)
      )
    );
    const sel = session.editor.getSelection();
    if (sel) session.editor.revealPositionInCenterIfOutsideViewport(sel.getPosition());
  }
  if (typeof saved.scrollTop === 'number') session.editor.setScrollTop(saved.scrollTop);
  if (typeof saved.scrollLeft === 'number') session.editor.setScrollLeft(saved.scrollLeft);
}

async function ensureModel(filePath) {
  let model = session.fileModels.get(filePath);
  const uri = window.monaco?.Uri?.parse('file:///' + filePath);
  if (!model && uri) {
    model = window.monaco.editor.getModel(uri);
    if (model) session.fileModels.set(filePath, model);
  }
  if (model) return model;
  let content = session.fileCache[filePath];
  if (content === undefined) {
    try {
      const data = await fetchFile(filePath);
      content = data.content;
    } catch {
      content = '';
    }
    const draftContent = await checkDraftOnOpen(filePath, content);
    if (draftContent !== null) {
      content = draftContent;
      session.dirtyFiles.add(filePath);
    }
    session.fileCache[filePath] = content;
  }
  const ext = filePath.split('.').pop();
  const lang = ext === 'typ' ? 'typst' : ext;
  model = window.monaco?.editor?.createModel?.(content || '', lang, uri);
  session.fileModels.set(filePath, model);
  return model;
}

export async function openFile(filePath) {
  if (session.currentFile && session.editor && session.currentFile !== filePath) {
    session.fileCache[session.currentFile] = session.editor.getValue();
    saveEditorState(session.currentFile);
  }
  const model = await ensureModel(filePath);
  session.currentFile = filePath;
  if (session.editor) {
    if (session.editor.getModel() !== model) session.editor.setModel(model);
    restoreEditorState(filePath);
  }
  if (!session.openTabs.includes(filePath)) session.openTabs.push(filePath);
  localStorage.setItem('typst-editor:last-file', filePath);
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateStatusBar();
  renderCurrentPreview(session.fileCache[filePath] ?? '');
  const timelinePanel = document.getElementById('panel-timeline');
  if (timelinePanel && timelinePanel.classList.contains('active')) {
    renderTimelinePanel(filePath);
  }
}

export async function switchToTab(filePath) {
  await openFile(filePath);
}

export async function closeTab(filePath) {
  if (session.dirtyFiles.has(filePath)) {
    const ok = await showConfirm('关闭未保存文件', `文件 ${filePath} 未保存，确定关闭？`);
    if (!ok) return;
  }
  const idx = session.openTabs.indexOf(filePath);
  if (idx === -1) return;
  session.openTabs.splice(idx, 1);
  const model = session.fileModels.get(filePath);
  const wasCurrent = filePath === session.currentFile;
  if (wasCurrent) {
    const next =
      session.openTabs.length > 0
        ? session.openTabs[Math.min(idx, session.openTabs.length - 1)]
        : null;
    if (next) {
      const m = await ensureModel(next);
      session.currentFile = next;
      if (session.editor) {
        if (session.editor.getModel() !== m) session.editor.setModel(m);
        restoreEditorState(next);
      }
      localStorage.setItem('typst-editor:last-file', next);
      renderCurrentPreview(session.fileCache[next] ?? '');
    } else {
      session.currentFile = null;
      if (session.editor) {
        session.editor.setModel(null);
      }
      clearPreview();
    }
  }
  if (model) {
    try {
      model.dispose();
    } catch {
      /* ignore */
    }
  }
  session.fileModels.delete(filePath);
  delete session.fileCache[filePath];
  session.dirtyFiles.delete(filePath);
  cursorPositions.delete(filePath);
  persistCursorPositions();
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateSaveStatus();
  updateStatusBar();
}

export function renderTabs() {
  const scroll = document.getElementById('tabs-scroll');
  if (!scroll) return;
  scroll.innerHTML = '';
  const bar = document.getElementById('tab-bar');
  if (bar) bar.classList.remove('hidden');
  for (const path of session.openTabs) {    const tab = document.createElement('div');
    tab.className =
      'tab' +
      (path === session.currentFile ? ' active' : '') +
      (session.dirtyFiles.has(path) ? ' dirty' : '');
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
    tab.draggable = true;
    tab.addEventListener('dragstart', (e) => {
      tabDragPath = path;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', path);
      } catch {
        /* ignore */
      }
    });
    tab.addEventListener('dragend', () => {
      tabDragPath = null;
      clearTabDragIndicators();
    });
    tab.addEventListener('dragover', (e) => {
      if (!tabDragPath || tabDragPath === path) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = tab.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      tab.classList.toggle('drop-before', before);
      tab.classList.toggle('drop-after', !before);
    });
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drop-before', 'drop-after');
    });
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const from = tabDragPath;
      tabDragPath = null;
      clearTabDragIndicators();
      if (!from || from === path) return;
      const fromIdx = session.openTabs.indexOf(from);
      const toIdx = session.openTabs.indexOf(path);
      if (fromIdx === -1 || toIdx === -1) return;
      const rect = tab.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      session.openTabs.splice(fromIdx, 1);
      const insertAt = session.openTabs.indexOf(path) + (before ? 0 : 1);
      session.openTabs.splice(insertAt, 0, from);
      renderTabs();
    });
    scroll.appendChild(tab);
  }
  persistTabs();
}

let tabDragPath = null;

function clearTabDragIndicators() {
  const bar = document.getElementById('tabs-scroll');
  if (!bar) return;
  for (const el of bar.querySelectorAll('.tab.dragging, .tab.drop-before, .tab.drop-after')) {
    el.classList.remove('dragging', 'drop-before', 'drop-after');
  }
}

function persistTabs() {
  try {
    localStorage.setItem('typst-editor:open-tabs', JSON.stringify(session.openTabs));
  } catch {
    /* ignore */
  }
}

export async function saveFile(filePath) {
  if (!filePath) return false;
  const model = session.fileModels.get(filePath);
  let content = model && !model.isDisposed() ? model.getValue() : session.fileCache[filePath];
  if (content === undefined) content = '';
  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = '保存中...';
    statusEl.className = 'saving';
  }
  try {
    await writeFile(filePath, content);
    session.fileCache[filePath] = content;
    session.dirtyFiles.delete(filePath);
    clearDraftAfterSave(filePath);
    snapshotOnSave(filePath).catch(() => {});
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

export async function saveCurrentFile() {
  if (!session.currentFile) return;
  session.fileCache[session.currentFile] = session.editor.getValue();
  await saveFile(session.currentFile);
}

export async function saveAllFiles() {
  if (session.currentFile && session.editor) {
    session.fileCache[session.currentFile] = session.editor.getValue();
  }
  for (const path of [...session.openTabs]) {
    if (session.dirtyFiles.has(path)) await saveFile(path);
  }
}

export async function jumpToError(err, parsed) {
  let file = (parsed && parsed.path ? parsed.path : err.path || '').replace(/^\/+/, '');
  if (file === 'worker-main.typ' || file.startsWith('worker-') || file.includes(':')) {
    file = session.currentFile;
  }
  if (!file) return;
  await openFile(file);
  if (parsed && parsed.line && session.editor) {
    const pos = { lineNumber: parsed.line, column: Math.max(1, parsed.col) };
    session.editor.revealPositionInCenter(pos);
    session.editor.setPosition(pos);
    session.editor.focus();
  }
}

export { ensureModel, parseRange };
