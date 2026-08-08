import { fetchFile } from './file-api.js';
import { getEntryFile, getEntryContent, isEntryUsable } from './entry.js';

const workerFiles = new Map();
const compilerPending = new Map();

let compilerWorker = null;
let compilerRequestId = 0;
let lastWorkerDiagnostics = [];
let onWorkspaceSynced = null;

export function setOnWorkspaceSynced(fn) {
  onWorkspaceSynced = fn;
}

export function getLastDiagnostics() {
  return lastWorkerDiagnostics;
}

function getCompilerWorker() {
  if (!compilerWorker) {
    compilerWorker = new Worker(new URL('./typst-compiler-worker.js', import.meta.url), {
      type: 'module',
    });
    compilerWorker.addEventListener('message', (event) => {
      const { id, ok, data, error, cancelled, diagnostics } = event.data;
      const pending = compilerPending.get(id);
      if (!pending) return;
      compilerPending.delete(id);
      if (cancelled) {
        pending.resolve({ __cancelled: true });
      } else if (ok) {
        lastWorkerDiagnostics = diagnostics || [];
        pending.resolve(data);
      } else {
        lastWorkerDiagnostics = diagnostics || [];
        pending.reject(new Error(error || 'compile failed'));
      }
    });
    compilerWorker.addEventListener('error', (event) => {
      const crashed = [...compilerPending.entries()];
      compilerPending.clear();
      const message = event.message || 'compiler worker error';
      const retryable = crashed.filter(([, p]) => (p.retries || 0) < 1);
      const failed = crashed.filter(([, p]) => (p.retries || 0) >= 1);
      compilerWorker = null;
      if (retryable.length > 0) {
        const fresh = getCompilerWorker();
        for (const [id, pending] of retryable) {
          pending.retries = (pending.retries || 0) + 1;
          compilerPending.set(id, pending);
          fresh.postMessage({ id, mainContent: pending.mainContent, format: pending.format });
        }
      }
      for (const [, pending] of failed) {
        pending.reject(new Error(message));
      }
    });
    for (const [vpath, content] of workerFiles) {
      compilerWorker.postMessage({ type: 'sync', path: vpath, content });
    }
  }
  return compilerWorker;
}

export function compileInWorker(mainContent, format = 'vector') {
  const id = ++compilerRequestId;
  return new Promise((resolve, reject) => {
    compilerPending.set(id, { resolve, reject, mainContent, format });
    getCompilerWorker().postMessage({ id, mainContent, format });
  });
}

export async function compileEntryInWorker(format = 'vector') {
  const usable = await isEntryUsable();
  if (!usable) return null;
  const content = await getEntryContent();
  if (content === null) return null;
  syncWorkerFile(getEntryFile(), content);
  return compileInWorker(content, format);
}

export function restartCompilerWorker(skipContent) {
  if (!compilerWorker || compilerPending.size === 0) return;
  for (const pending of compilerPending.values()) {
    if (skipContent !== undefined && pending.mainContent === skipContent) return;
  }
  const old = compilerWorker;
  compilerWorker = null;
  for (const pending of compilerPending.values()) {
    pending.resolve({ __cancelled: true });
  }
  compilerPending.clear();
  old.terminate();
}

export function syncWorkerFile(path, content) {
  const vpath = `/${path}`.replace(/\/+/g, '/');
  workerFiles.set(vpath, content);
  if (compilerWorker) {
    compilerWorker.postMessage({ type: 'sync', path: vpath, content });
  }
}

export function removeWorkerFile(path) {
  const vpath = `/${path}`.replace(/\/+/g, '/');
  workerFiles.delete(vpath);
  if (compilerWorker) {
    compilerWorker.postMessage({ type: 'remove', path: vpath });
  }
}

export async function syncWorkspaceToWorker() {
  const session = (await import('./state.js')).session;
  const { collectReferencedPaths, resolveRefPath } = await import('./definition.js');
  const wanted = new Map();
  const roots = [...session.openTabs];
  if (session.currentFile && !roots.includes(session.currentFile)) roots.push(session.currentFile);
  const queue = [...roots];
  const visited = new Set(queue);
  for (const p of roots) wanted.set('/' + p.replace(/^\/+/, ''), p);
  while (queue.length > 0) {
    const from = queue.shift();
    const vpath = '/' + from.replace(/^\/+/, '');
    let content = workerFiles.get(vpath);
    if (content == null) {
      try {
        const data = await fetchFile(from);
        content = data.content ?? null;
      } catch {
        content = null;
      }
    }
    if (content == null) continue;
    for (const ref of collectReferencedPaths(content)) {
      const target = resolveRefPath(ref, from);
      if (visited.has(target)) continue;
      visited.add(target);
      const tpath = '/' + target.replace(/^\/+/, '');
      wanted.set(tpath, target);
      queue.push(target);
    }
  }
  for (const [vpath, path] of wanted) {
    if (workerFiles.has(vpath)) continue;
    try {
      const data = await fetchFile(path);
      if (data.content !== undefined) syncWorkerFile(path, data.content);
    } catch {
      // ignore unreadable files
    }
  }
  for (const vpath of [...workerFiles.keys()]) {
    if (!wanted.has(vpath)) removeWorkerFile(vpath.replace(/^\//, ''));
  }
  if (onWorkspaceSynced) {
    onWorkspaceSynced();
  }
}
