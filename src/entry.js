import { session } from './state.js';
import { fetchFile, fileExists } from './file-api.js';
import { syncWorkerFile } from './compiler.js';

const ENTRY_KEY = 'typst-editor:entry-file';

export function initEntry() {
  const saved = localStorage.getItem(ENTRY_KEY);
  session.entryFile = saved || null;
}

export function setEntryFile(filePath) {
  session.entryFile = filePath;
  localStorage.setItem(ENTRY_KEY, filePath);
}

export function clearEntryFile() {
  session.entryFile = null;
  localStorage.removeItem(ENTRY_KEY);
}

export function getEntryFile() {
  return session.entryFile || null;
}

export function hasEntry() {
  return !!session.entryFile;
}

export async function getEntryContent() {
  const entry = session.entryFile;
  if (!entry) return null;
  if (session.fileCache[entry] !== undefined) return session.fileCache[entry];
  try {
    const data = await fetchFile(entry);
    session.fileCache[entry] = data.content;
    return data.content;
  } catch {
    return null;
  }
}

export async function isEntryUsable() {
  const entry = session.entryFile;
  if (!entry) return false;
  if (session.fileCache[entry] !== undefined) return true;
  return fileExists(entry);
}

export async function prepareEntryForCompile() {
  const entry = session.entryFile;
  if (!entry) return false;
  let content = null;
  const model = session.fileModels.get(entry);
  if (model && !model.isDisposed()) {
    content = model.getValue();
  } else if (session.fileCache[entry] !== undefined) {
    content = session.fileCache[entry];
  } else {
    try {
      const data = await fetchFile(entry);
      content = data.content;
      session.fileCache[entry] = content;
    } catch {
      return false;
    }
  }
  syncWorkerFile(entry, content);
  return true;
}
