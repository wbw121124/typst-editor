import { session } from './state.js';

let wordTimer = null;

function getDialogEls() {
  return {
    mask: document.getElementById('dialog-mask'),
    box: document.getElementById('dialog-box'),
    title: document.getElementById('dialog-title'),
    message: document.getElementById('dialog-message'),
    input: document.getElementById('dialog-input'),
    ok: document.getElementById('dialog-ok'),
    cancel: document.getElementById('dialog-cancel'),
  };
}

let dialogResolve = null;

export function showDialog({
  title,
  message = '',
  okText = '确定',
  cancelText = '取消',
  showInput = false,
  defaultValue = '',
  placeholder = '',
}) {
  return new Promise((resolve) => {
    const els = getDialogEls();
    if (!els.mask) {
      resolve(null);
      return;
    }
    dialogResolve = resolve;
    els.title.textContent = title;
    els.message.textContent = message;
    els.input.value = defaultValue;
    els.input.placeholder = placeholder;
    els.input.classList.toggle('hidden', !showInput);
    els.ok.textContent = okText;
    els.cancel.textContent = cancelText;
    els.cancel.classList.toggle('hidden', cancelText === '');
    els.mask.classList.remove('hidden');
    if (showInput) {
      setTimeout(() => els.input.focus(), 50);
    }
    const close = (val) => {
      els.mask.classList.add('hidden');
      if (dialogResolve) {
        dialogResolve(val);
        dialogResolve = null;
      }
    };
    els.ok.onclick = () => close(showInput ? els.input.value : true);
    els.cancel.onclick = () => close(null);
    els.mask.onclick = (e) => {
      if (e.target === els.mask) close(null);
    };
    els.input.onkeydown = (e) => {
      if (e.key === 'Enter') close(showInput ? els.input.value : true);
      if (e.key === 'Escape') close(null);
    };
    els.ok.onkeydown = (e) => {
      if (e.key === 'Escape') close(null);
    };
  });
}

export function showConfirm(title, message, okText = '确定') {
  return showDialog({ title, message, okText, cancelText: '取消' });
}

export function showAlert(title, message, okText = '确定') {
  return showDialog({ title, message, okText, cancelText: '' });
}

export function showPrompt(title, defaultValue = '', placeholder = '') {
  return showDialog({ title, showInput: true, defaultValue, placeholder });
}

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
  const entry = session.entryFile;
  const entryEl = document.getElementById('statusbar-entry');
  if (entryEl) {
    entryEl.textContent = entry ? `入口: ${entry}` : '';
    entryEl.title = entry ? `编译入口: ${entry}` : '';
  }
  updateWordCount();
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

export function updateWordCount() {
  clearTimeout(wordTimer);
  wordTimer = setTimeout(() => {
    const el = document.getElementById('statusbar-words');
    if (!el) return;
    const model = session.editor && session.editor.getModel();
    if (!model || !session.currentFile) {
      el.textContent = '';
      return;
    }
    const text = model.getValue();
    const chars = text.length;
    const words = (text.match(/[\u4e00-\u9fff]|[\w]+/g) || []).length;
    el.textContent = `${words} 词, ${chars} 字`;
  }, 300);
}
