import { session } from './state.js';

export function updateFileTreeActive() {
  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    el.classList.toggle('active', el.dataset.path === session.currentFile);
  });
}

export function updateTreeDots() {
  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    el.classList.toggle('dirty', session.dirtyFiles.has(el.dataset.path));
  });
}

export function updateStatusBar() {
  const fileEl = document.getElementById('statusbar-file');
  if (fileEl) fileEl.textContent = session.currentFile || '未打开文件';
  const modeEl = document.getElementById('statusbar-mode');
  if (modeEl) modeEl.textContent = session.previewMode === 'pdf' ? 'PDF' : '画布';
}

export function updateSaveStatus() {
  const saveEl = document.getElementById('save-status');
  if (!saveEl) return;
  if (session.dirtyFiles.size > 0) {
    saveEl.textContent = `未保存 (${session.dirtyFiles.size})`;
    saveEl.className = 'dirty';
  } else {
    saveEl.textContent = '已保存';
    saveEl.className = 'saved';
  }
}
