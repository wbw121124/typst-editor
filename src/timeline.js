import { session } from './state.js';
import {
  fetchHistory,
  fetchHistorySnapshot,
  saveHistorySnapshot,
  deleteHistorySnapshot,
  fetchDraft,
  saveDraft,
  deleteDraft,
  writeFile,
} from './file-api.js';
import { showToast } from './preview.js';
import { syncWorkerFile } from './compiler.js';
import { syncFile } from './typst-project.js';
import { showConfirm, showAlert } from './ui.js';

let draftTimer = null;
let snapTimer = null;

function getCurrentContent() {
  const model = session.editor && session.editor.getModel();
  if (model && !model.isDisposed()) return model.getValue();
  return null;
}

function fileContent(filePath) {
  const model = session.fileModels.get(filePath);
  if (model && !model.isDisposed()) return model.getValue();
  return session.fileCache[filePath];
}

export function scheduleDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const filePath = session.currentFile;
    if (!filePath) return;
    const content = getCurrentContent();
    if (content === null) return;
    if (session.fileCache[filePath] === content) {
      deleteDraft(filePath).catch(() => {});
      return;
    }
    saveDraft(filePath, content).catch((err) => {
      console.warn('[Draft] save failed:', err);
    });
  }, 2000);
}

export async function flushDraft() {
  clearTimeout(draftTimer);
  const filePath = session.currentFile;
  if (!filePath) return;
  const content = getCurrentContent();
  if (content === null) return;
  if (session.fileCache[filePath] === content) return;
  try {
    await saveDraft(filePath, content);
  } catch (err) {
    console.warn('[Draft] flush failed:', err);
  }
}

export async function checkDraftOnOpen(filePath, diskContent) {
  try {
    const draft = await fetchDraft(filePath);
    if (!draft) return null;
    if (draft.content === diskContent) {
      deleteDraft(filePath).catch(() => {});
      return null;
    }
    const restore = await showConfirm(
      '恢复未保存的草稿',
      `检测到 ${filePath} 有未保存的草稿（保存于 ${new Date(draft.time).toLocaleString()}）。\n\n是否恢复草稿？\n确定 = 恢复草稿\n取消 = 使用磁盘版本`
    );
    if (restore) return draft.content;
    deleteDraft(filePath).catch(() => {});
    return null;
  } catch {
    return null;
  }
}

export function clearDraftAfterSave(filePath) {
  deleteDraft(filePath).catch(() => {});
}

function timelinePanelActive() {
  const panel = document.getElementById('panel-timeline');
  return panel && panel.classList.contains('active');
}

function refreshTimelineIfActive(filePath) {
  if (timelinePanelActive()) {
    renderTimelinePanel(filePath || session.currentFile);
  }
}

export async function snapshotOnSave(filePath) {
  const content = fileContent(filePath);
  if (content === undefined) return;
  try {
    await saveHistorySnapshot(filePath, content);
    refreshTimelineIfActive(filePath);
  } catch (err) {
    console.warn('[Timeline] snapshot failed:', err);
  }
}

export function scheduleAutoSnapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    const filePath = session.currentFile;
    if (!filePath) return;
    const content = getCurrentContent();
    if (content === null) return;
    if (session.fileCache[filePath] === content) return;
    saveHistorySnapshot(filePath, content)
      .then(() => {
        refreshTimelineIfActive(filePath);
        if (session.currentFile === filePath) {
          const cur = getCurrentContent();
          if (cur !== null && cur !== session.fileCache[filePath]) {
            return saveHistorySnapshot(filePath, cur).then(() => refreshTimelineIfActive(filePath));
          }
        }
        return null;
      })
      .catch((err) => console.warn('[Timeline] auto snapshot failed:', err));
  }, 3000);
}

export async function renderTimelinePanel(filePath) {
  const listEl = document.getElementById('timeline-list');
  if (!listEl) return;
  if (!filePath) {
    listEl.innerHTML = '<div class="timeline-empty">未打开文件</div>';
    return;
  }
  listEl.innerHTML = '<div class="timeline-empty">加载中...</div>';
  try {
    const items = await fetchHistory(filePath);
    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="timeline-empty">暂无历史版本<br>（保存或编辑暂停时会自动记录）</div>';
      return;
    }
    listEl.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'timeline-item';
      const when = document.createElement('div');
      when.className = 'timeline-time';
      when.textContent = new Date(item.time).toLocaleString();
      const size = document.createElement('span');
      size.className = 'timeline-size';
      size.textContent = `${(item.size / 1024).toFixed(1)} KB`;
      when.appendChild(size);
      const actions = document.createElement('div');
      actions.className = 'timeline-actions';
      const previewBtn = document.createElement('button');
      previewBtn.textContent = '预览';
      previewBtn.addEventListener('click', async () => {
        try {
          const snap = await fetchHistorySnapshot(item.id);
          showSnapshot(snap.content);
        } catch (err) {
          showToast(`读取快照失败: ${err.message}`);
        }
      });
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '恢复';
      restoreBtn.addEventListener('click', async () => {
        const ok = await showConfirm('恢复历史版本', '确定恢复该版本？\n当前内容将被覆盖。');
        if (!ok) return;
        try {
          const snap = await fetchHistorySnapshot(item.id);
          await writeFile(filePath, snap.content);
          session.fileCache[filePath] = snap.content;
          syncWorkerFile(filePath, snap.content);
          syncFile(filePath, snap.content).catch(() => {});
          const model = session.fileModels.get(filePath);
          if (model && !model.isDisposed()) {
            model.setValue(snap.content);
          }
          session.dirtyFiles.delete(filePath);
          showToast('已恢复历史版本');
        } catch (err) {
          showToast(`恢复失败: ${err.message}`);
        }
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', async () => {
        const ok = await showConfirm('删除历史快照', '删除该历史快照？');
        if (!ok) return;
        try {
          await deleteHistorySnapshot(item.id);
          renderTimelinePanel(filePath);
        } catch (err) {
          showToast(`删除失败: ${err.message}`);
        }
      });
      actions.appendChild(previewBtn);
      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);
      row.appendChild(when);
      row.appendChild(actions);
      listEl.appendChild(row);
    }
  } catch (err) {
    listEl.innerHTML = `<div class="timeline-empty">加载失败: ${err.message}</div>`;
  }
}

function showSnapshot(content) {
  const viewer = window.monaco && window.monaco.editor;
  const container = document.getElementById('snapshot-viewer');
  if (!container || !viewer) {
    showAlert('历史快照内容', content || '(空)');
    return;
  }
  container.classList.remove('hidden');
  let editor = container.querySelector('.snapshot-editor');
  if (!editor) {
    editor = document.createElement('div');
    editor.className = 'snapshot-editor';
    container.insertBefore(editor, container.firstChild);
    window._snapshotEditor = viewer.create(editor, {
      value: content,
      language: 'typst',
      readOnly: true,
      automaticLayout: true,
      theme: 'vs-dark',
    });
  } else {
    window._snapshotEditor.setValue(content);
  }
}

export function closeSnapshotViewer() {
  const container = document.getElementById('snapshot-viewer');
  if (!container) return;
  container.classList.add('hidden');
  container.innerHTML = '';
  if (window._snapshotEditor) {
    const model = window._snapshotEditor.getModel();
    if (model) model.dispose();
    window._snapshotEditor.dispose();
    window._snapshotEditor = null;
  }
}
