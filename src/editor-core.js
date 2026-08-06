import { session } from './state.js';
import { parseRange } from './utils.js';
import { fetchFile, writeFile } from './file-api.js';
import { renderCurrentPreview, clearPreview } from './preview.js';
import { updateFileTreeActive, updateTreeDots, updateSaveStatus, updateStatusBar } from './ui.js';

async function ensureModel(filePath) {
  let model = session.fileModels.get(filePath);
  if (model) return model;
  let content = session.fileCache[filePath];
  if (content === undefined) {
    try {
      const data = await fetchFile(filePath);
      content = data.content;
    } catch {
      content = '';
    }
    session.fileCache[filePath] = content;
  }
  const ext = filePath.split('.').pop();
  const lang = ext === 'typ' ? 'typst' : ext;
  model = window.monaco?.editor?.createModel?.(content || '', lang);
  session.fileModels.set(filePath, model);
  return model;
}

export async function openFile(filePath) {
  if (session.currentFile && session.editor && session.currentFile !== filePath) {
    session.fileCache[session.currentFile] = session.editor.getValue();
  }
  const model = await ensureModel(filePath);
  session.currentFile = filePath;
  if (session.editor) {
    if (session.editor.getModel() !== model) session.editor.setModel(model);
  }
  if (!session.openTabs.includes(filePath)) session.openTabs.push(filePath);
  localStorage.setItem('typst-editor:last-file', filePath);
  updateFileTreeActive();
  renderTabs();
  updateTreeDots();
  updateStatusBar();
  renderCurrentPreview(session.fileCache[filePath] ?? '');
}

export async function switchToTab(filePath) {
  await openFile(filePath);
}

export async function closeTab(filePath) {
  if (session.dirtyFiles.has(filePath)) {
    if (!confirm(`文件 ${filePath} 未保存，确定关闭？`)) return;
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
  if (bar) bar.classList.toggle('hidden', session.openTabs.length <= 1);
  for (const path of session.openTabs) {
    const tab = document.createElement('div');
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
    scroll.appendChild(tab);
  }
}

export async function saveFile(filePath) {
  if (!filePath) return false;
  const content = session.fileCache[filePath] ?? '';
  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = '保存中...';
    statusEl.className = 'saving';
  }
  try {
    await writeFile(filePath, content);
    session.dirtyFiles.delete(filePath);
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
