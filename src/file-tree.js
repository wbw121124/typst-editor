import { session } from './state.js';
import { fetchFiles, fetchFile, writeFile, deleteFileApi } from './file-api.js';
import { removeWorkerFile, syncWorkerFile, syncWorkspaceToWorker } from './compiler.js';
import { openFile, closeTab, renderTabs } from './editor-core.js';
import { clearPreview } from './preview.js';
import { updateTreeDots, updateSaveStatus, updateStatusBar } from './ui.js';

export async function loadFileTree() {
  const tree = document.getElementById('file-tree');
  try {
    const files = await fetchFiles();
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
    syncWorkspaceToWorker(files).catch((e) =>
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
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '\u25bc';
      el.appendChild(arrow);
      el.appendChild(document.createTextNode(' ' + item.name));

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
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = '\ud83d\udcc4';
      el.appendChild(icon);
      el.appendChild(document.createTextNode(' ' + item.name));
      el.dataset.path = item.path;
      if (item.path === session.currentFile) el.classList.add('active');
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
  container.className = '';

  const items = [
    { label: '打开', keybinding: 'Enter', run: () => openFile(item.path) },
    { label: '重命名', keybinding: 'F2', run: () => renameFile(item.path) },
    { label: '删除', keybinding: 'Del', run: () => deleteFile(item.path) },
  ];

  for (const mi of items) {
    const row = document.createElement('div');
    row.className = 'file-menu-item';
    const label = document.createElement('span');
    label.textContent = mi.label;
    const kb = document.createElement('span');
    kb.className = 'file-menu-kb';
    kb.textContent = mi.keybinding;
    row.appendChild(label);
    row.appendChild(kb);
    row.addEventListener('click', () => {
      hideFileContextMenu();
      mi.run();
    });
    row.addEventListener('mouseenter', () => row.classList.add('active'));
    row.addEventListener('mouseleave', () => row.classList.remove('active'));
    container.appendChild(row);
  }

  document.body.appendChild(container);

  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 100);
  container.style.left = x + 'px';
  container.style.top = y + 'px';
  container.classList.add('visible');

  setTimeout(() => {
    document.addEventListener('click', hideFileContextMenu, { once: true });
    document.addEventListener('contextmenu', hideFileContextMenu, { once: true });
    document.addEventListener('focusout', hideFileContextMenu, { once: true });
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
    const data = await fetchFile(oldPath);
    await writeFile(newPath, data.content);
    await deleteFileApi(oldPath);
    const wasCurrent = session.currentFile === oldPath;
    const oldModel = session.fileModels.get(oldPath);
    session.fileModels.delete(oldPath);
    const oldIdx = session.openTabs.indexOf(oldPath);
    if (oldIdx !== -1) session.openTabs[oldIdx] = newPath;
    session.fileCache[newPath] = data.content;
    delete session.fileCache[oldPath];
    if (session.dirtyFiles.has(oldPath)) {
      session.dirtyFiles.delete(oldPath);
      session.dirtyFiles.add(newPath);
    }
    removeWorkerFile(oldPath);
    syncWorkerFile(newPath, data.content);
    await loadFileTree();
    if (wasCurrent) {
      if (oldModel && oldModel === session.editor.getModel()) {
        await openFile(newPath);
        try {
          oldModel.dispose();
        } catch {
          /* ignore */
        }
      } else {
        await openFile(newPath);
      }
    } else if (oldModel) {
      try {
        oldModel.dispose();
      } catch {
        /* ignore */
      }
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
    await deleteFileApi(filePath);
    delete session.fileCache[filePath];
    removeWorkerFile(filePath);
    session.dirtyFiles.delete(filePath);
    const model = session.fileModels.get(filePath);
    session.fileModels.delete(filePath);
    const idx = session.openTabs.indexOf(filePath);
    if (idx !== -1) session.openTabs.splice(idx, 1);
    if (session.currentFile === filePath) {
      if (session.openTabs.length > 0) {
        const next = session.openTabs[Math.min(idx, session.openTabs.length - 1)];
        await openFile(next);
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
    renderTabs();
    updateTreeDots();
    updateSaveStatus();
    updateStatusBar();
    await loadFileTree();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

async function createNewFile() {
  const name = prompt('新建文件 (例如 hello.typ):');
  if (!name) return;
  const filePath = name.endsWith('.typ') ? name : name + '.typ';

  try {
    await writeFile(filePath, '');
    session.fileCache[filePath] = '';
    syncWorkerFile(filePath, '');
    await loadFileTree();
    openFile(filePath);
  } catch (err) {
    console.error('Create failed:', err);
  }
}

export { createNewFile };

export function setupFileTree() {
  const newBtn = document.getElementById('btn-new-file');
  if (newBtn) newBtn.addEventListener('click', createNewFile);
  const refreshBtn = document.getElementById('btn-refresh-tree');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadFileTree());
}
