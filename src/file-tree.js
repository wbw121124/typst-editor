import { session } from './state.js';
import {
  fetchFiles,
  fetchFile,
  writeFile,
  deleteFileApi,
  moveFileApi,
  createDirApi,
  deleteDirApi,
} from './file-api.js';
import { removeWorkerFile, syncWorkerFile, syncWorkspaceToWorker } from './compiler.js';
import { openFile, closeTab, renderTabs } from './editor-core.js';
import { clearPreview } from './preview.js';
import { updateTreeDots, updateSaveStatus, updateStatusBar, showPrompt, showConfirm } from './ui.js';
import { showToast } from './preview.js';
import { setEntryFile, clearEntryFile } from './entry.js';

let dragState = null;

export async function loadFileTree() {
  const tree = document.getElementById('file-tree');
  try {
    const files = await fetchFiles();
    tree.innerHTML = '';
    renderTree(tree, files, '');
    updateTreeDots();
    updateEntryMarks();
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
      el.dataset.path = item.path;
      el.dataset.type = 'directory';
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

      el.addEventListener('click', (e) => {
        if (e.target.closest('.dir-actions')) return;
        const collapsed = el.classList.toggle('collapsed');
        child.style.display = collapsed ? 'none' : '';
        localStorage.setItem(collapseKey, collapsed ? '1' : '0');
      });
      el.addEventListener('contextmenu', (e) => showFileContextMenu(e, item));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('drag-over');
        handleDrop(e, item);
      });

      const actions = document.createElement('span');
      actions.className = 'dir-actions';
      actions.innerHTML = '&#10133;';
      actions.title = '在此目录新建文件';
      actions.addEventListener('click', (e) => {
        e.stopPropagation();
        createNewFileIn(item.path);
      });
      el.appendChild(actions);

      wrapper.appendChild(el);
      wrapper.appendChild(child);
      container.appendChild(wrapper);

      renderTree(child, item.children);
    } else {
      const el = document.createElement('div');
      el.className = 'file-item';
      el.dataset.path = item.path;
      el.dataset.type = 'file';
      el.draggable = true;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = '\ud83d\udcc4';
      el.appendChild(icon);
      el.appendChild(document.createTextNode(' ' + item.name));
      if (item.path === session.currentFile) el.classList.add('active');
      el.addEventListener('click', () => openFile(item.path));
      el.addEventListener('contextmenu', (e) => showFileContextMenu(e, item));
      el.addEventListener('dragstart', (e) => {
        dragState = { path: item.path, type: 'file' };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.path);
      });
      el.addEventListener('dragend', () => {
        dragState = null;
        document.querySelectorAll('.drag-over').forEach((n) => n.classList.remove('drag-over'));
      });
      container.appendChild(el);
    }
  }
}

function updateEntryMarks() {
  const entry = session.entryFile;
  document.querySelectorAll('.file-item[data-path]').forEach((el) => {
    const isEntry = entry && el.dataset.path === entry;
    el.classList.toggle('entry-file', isEntry);
    let badge = el.querySelector('.entry-badge');
    if (isEntry && !badge) {
      badge = document.createElement('span');
      badge.className = 'entry-badge';
      badge.textContent = '入口';
      el.appendChild(badge);
    } else if (!isEntry && badge) {
      badge.remove();
    }
  });
}

export function refreshEntryMark() {
  updateEntryMarks();
}

async function handleDrop(e, targetDir) {
  const target = targetDir ? targetDir.path : '';
  const from = dragState ? dragState.path : e.dataTransfer.getData('text/plain');
  if (!from) return;
  const name = from.split('/').pop();
  const to = target ? `${target}/${name}` : name;
  if (from === to) return;
  try {
    await moveFileApi(from, to);
    await onPathMoved(from, to);
    await loadFileTree();
    showToast(`已移动到 ${to}`);
  } catch (err) {
    console.error('Move failed:', err);
    showToast(`移动失败: ${err.message}`);
  }
}

async function onPathMoved(oldPath, newPath) {
  const model = session.fileModels.get(oldPath);
  const wasCurrent = session.currentFile === oldPath;
  const oldIdx = session.openTabs.indexOf(oldPath);
  if (oldIdx !== -1) session.openTabs[oldIdx] = newPath;
  if (session.fileCache[oldPath] !== undefined) {
    session.fileCache[newPath] = session.fileCache[oldPath];
    delete session.fileCache[oldPath];
  }
  if (session.dirtyFiles.has(oldPath)) {
    session.dirtyFiles.delete(oldPath);
    session.dirtyFiles.add(newPath);
  }
  session.fileModels.delete(oldPath);
  if (session.entryFile === oldPath) setEntryFile(newPath);
  removeWorkerFile(oldPath);
  if (wasCurrent) {
    session.currentFile = newPath;
    localStorage.setItem('typst-editor:last-file', newPath);
    if (model && model === session.editor.getModel()) {
      session.fileModels.set(newPath, model);
      await openFile(newPath);
    }
  }
  renderTabs();
  updateTreeDots();
  updateStatusBar();
}

function showFileContextMenu(e, item) {
  e.preventDefault();
  e.stopPropagation();
  hideFileContextMenu();

  const container = document.getElementById('file-context-menu');
  container.className = '';

  const isDir = item.type === 'directory';
  const items = [
    { label: '打开', keybinding: 'Enter', run: () => openFile(item.path) },
    { label: isDir ? '新建文件' : '新建文件', keybinding: '', run: () => (isDir ? createNewFileIn(item.path) : createNewFile()) },
    { label: '新建目录', keybinding: '', run: () => createNewDirIn(isDir ? item.path : '') },
    { label: '重命名', keybinding: 'F2', run: () => (isDir ? renameDir(item.path) : renameFile(item.path)) },
    { label: '删除', keybinding: 'Del', run: () => (isDir ? deleteDir(item.path) : deleteFile(item.path)) },
  ];

  if (!isDir) {
    items.push({
      label: session.entryFile === item.path ? '取消设为编译入口' : '设为编译入口',
      keybinding: '',
      run: () => toggleEntry(item.path),
    });
  }

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

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 150);
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
  const newName = await showPrompt('重命名文件', oldPath.split('/').pop(), '输入新文件名');
  if (!newName || newName === oldPath.split('/').pop()) return;
  const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
  const newPath = dir ? `${dir}/${newName}` : newName;
  try {
    await moveFileApi(oldPath, newPath);
    await onPathMoved(oldPath, newPath);
    await loadFileTree();
  } catch (err) {
    console.error('Rename failed:', err);
    showToast(`重命名失败: ${err.message}`);
  }
}

async function renameDir(oldPath) {
  const newName = await showPrompt('重命名目录', oldPath.split('/').pop(), '输入新目录名');
  if (!newName || newName === oldPath.split('/').pop()) return;
  const parent = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
  const newPath = parent ? `${parent}/${newName}` : newName;
  try {
    await moveFileApi(oldPath, newPath);
    await onDirMoved(oldPath, newPath);
    await loadFileTree();
  } catch (err) {
    console.error('Rename dir failed:', err);
    showToast(`重命名失败: ${err.message}`);
  }
}

async function onDirMoved(oldPath, newPath) {
  const prefix = oldPath + '/';
  for (const path of [...session.openTabs]) {
    if (path.startsWith(prefix)) {
      const idx = session.openTabs.indexOf(path);
      session.openTabs[idx] = newPath + path.slice(oldPath.length);
    }
  }
  for (const [path, model] of [...session.fileModels.entries()]) {
    if (path.startsWith(prefix)) {
      const np = newPath + path.slice(oldPath.length);
      session.fileModels.delete(path);
      session.fileModels.set(np, model);
    }
  }
  for (const path of Object.keys(session.fileCache)) {
    if (path.startsWith(prefix)) {
      const np = newPath + path.slice(oldPath.length);
      session.fileCache[np] = session.fileCache[path];
      delete session.fileCache[path];
    }
  }
  for (const path of [...session.dirtyFiles]) {
    if (path.startsWith(prefix)) {
      session.dirtyFiles.delete(path);
      session.dirtyFiles.add(newPath + path.slice(oldPath.length));
    }
  }
  if (session.currentFile && session.currentFile.startsWith(prefix)) {
    session.currentFile = newPath + session.currentFile.slice(oldPath.length);
    localStorage.setItem('typst-editor:last-file', session.currentFile);
  }
  if (session.entryFile && session.entryFile.startsWith(prefix)) {
    setEntryFile(newPath + session.entryFile.slice(oldPath.length));
  }
  for (const path of [...session.openTabs]) {
    removeWorkerFile(path);
  }
  renderTabs();
  updateTreeDots();
  updateStatusBar();
}

async function deleteFile(filePath) {
  const ok = await showConfirm('删除文件', `确定删除 ${filePath}？`);
  if (!ok) return;
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
    if (session.entryFile === filePath) clearEntryFile();
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
    showToast(`删除失败: ${err.message}`);
  }
}

async function deleteDir(dirPath) {
  const ok = await showConfirm('删除目录', `确定删除目录 ${dirPath} 及其全部内容？`);
  if (!ok) return;
  try {
    await deleteDirApi(dirPath);
    for (const path of [...session.openTabs]) {
      if (path.startsWith(dirPath + '/')) {
        removeWorkerFile(path);
        const model = session.fileModels.get(path);
        session.fileModels.delete(path);
        delete session.fileCache[path];
        session.dirtyFiles.delete(path);
        const idx = session.openTabs.indexOf(path);
        if (idx !== -1) session.openTabs.splice(idx, 1);
        if (session.currentFile === path) {
          if (session.openTabs.length > 0) {
            await openFile(session.openTabs[0]);
          } else {
            session.currentFile = null;
            if (session.editor) session.editor.setModel(null);
            clearPreview();
          }
        }
        if (session.entryFile === path) clearEntryFile();
        if (model) {
          try {
            model.dispose();
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (session.entryFile && session.entryFile.startsWith(dirPath + '/')) clearEntryFile();
    renderTabs();
    updateTreeDots();
    updateSaveStatus();
    updateStatusBar();
    await loadFileTree();
  } catch (err) {
    console.error('Delete dir failed:', err);
    showToast(`删除目录失败: ${err.message}`);
  }
}

async function createNewFile() {
  const name = await showPrompt('新建文件', '', '例如 hello.typ');
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
    showToast(`新建失败: ${err.message}`);
  }
}

async function createNewFileIn(dirPath) {
  const name = await showPrompt('新建文件', '', `在 ${dirPath}/ 下新建 (例如 hello.typ)`);
  if (!name) return;
  const filePath = (dirPath ? dirPath + '/' : '') + (name.endsWith('.typ') ? name : name + '.typ');
  try {
    await writeFile(filePath, '');
    session.fileCache[filePath] = '';
    syncWorkerFile(filePath, '');
    await loadFileTree();
    openFile(filePath);
  } catch (err) {
    console.error('Create failed:', err);
    showToast(`新建失败: ${err.message}`);
  }
}

async function createNewDirIn(parentPath) {
  const name = await showPrompt('新建目录', '', '输入目录名');
  if (!name) return;
  const dirPath = (parentPath ? parentPath + '/' : '') + name;
  try {
    await createDirApi(dirPath);
    await loadFileTree();
    showToast(`已创建目录 ${dirPath}`);
  } catch (err) {
    console.error('Create dir failed:', err);
    showToast(`新建目录失败: ${err.message}`);
  }
}

function toggleEntry(filePath) {
  if (session.entryFile === filePath) {
    clearEntryFile();
    showToast('已取消编译入口');
  } else {
    setEntryFile(filePath);
    showToast(`已设为编译入口: ${filePath}`);
  }
  updateEntryMarks();
  updateStatusBar();
}

export { createNewFile };

export function setupFileTree() {
  const newBtn = document.getElementById('btn-new-file');
  if (newBtn) newBtn.addEventListener('click', createNewFile);
  const refreshBtn = document.getElementById('btn-refresh-tree');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadFileTree());

  const tree = document.getElementById('file-tree');
  if (tree) {
    tree.addEventListener('dragover', (e) => {
      if (!dragState) return;
      e.preventDefault();
    });
    tree.addEventListener('drop', (e) => {
      if (!dragState) return;
      e.preventDefault();
      if (e.target.closest('.dir-item')) return;
      handleDrop(e, null);
    });
  }

  let sseRetry = 0;
  function connectSse() {
    const es = new EventSource('/api/events');
    es.onmessage = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        loadFileTree();
      }, 500);
    };
    es.onerror = () => {
      es.close();
      sseRetry++;
      setTimeout(connectSse, Math.min(10000, 2000 * Math.pow(2, sseRetry)));
    };
    es.onopen = () => {
      sseRetry = 0;
    };
  }
  connectSse();
}

let refreshTimer = null;
