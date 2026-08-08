import { fetchFiles, fetchFile } from './file-api.js';
import { session } from './state.js';

const DEFINITION_RE = /#let\s+([A-Za-z_][\w-]*)\s*(?:\([^)]*\))?\s*=/g;
const LABEL_RE = /<([A-Za-z_][\w-]*)>/g;
const IMPORT_RE = /#import\s+"[^"]*"\s*:\s*(?:\(\s*)?([A-Za-z_][\w-]*(?:\s*,\s*[A-Za-z_][\w-]*)*)\)?/g;

let definitionIndex = new Map();
let indexBuiltAt = 0;
let building = null;

export async function buildDefinitionIndex(force = false) {
  if (building) return building;
  if (!force && definitionIndex.size > 0 && Date.now() - indexBuiltAt < 30000) return;
  building = (async () => {
    try {
      const files = await fetchFiles();
      const flat = [];
      (function walk(items) {
        for (const item of items) {
          if (item.type === 'directory') walk(item.children || []);
          else if (item.path.endsWith('.typ')) flat.push(item.path);
        }
      })(files);
      const index = new Map();
      for (const path of flat) {
        try {
          const data = await fetchFile(path);
          const content = data.content || '';
          for (const m of content.matchAll(IMPORT_RE)) {
            for (const name of m[1].split(/\s*,\s*/)) {
              index.set(name, { path, line: lineOf(content, m.index) });
            }
          }
        } catch {
          /* ignore unreadable */
        }
      }
      for (const path of flat) {
        try {
          const data = await fetchFile(path);
          const content = data.content || '';
          for (const m of content.matchAll(DEFINITION_RE)) {
            index.set(m[1], { path, line: lineOf(content, m.index) });
          }
          for (const m of content.matchAll(LABEL_RE)) {
            index.set(m[1], { path, line: lineOf(content, m.index) });
          }
        } catch {
          /* ignore unreadable */
        }
      }
      definitionIndex = index;
      indexBuiltAt = Date.now();
      return index;
    } finally {
      building = null;
    }
  })();
  return building;
}

function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function findIncludePath(lineText, position) {
  const re = /(?:#?(?:include|import)\s*\(\s*"([^"]+)"|#(?:include|import)\s+"([^"]+)")/g;
  for (const m of lineText.matchAll(re)) {
    const raw = m[1] || m[2];
    const qStart = m.index + m[0].indexOf('"');
    const qEnd = qStart + raw.length + 1;
    if (position.column - 1 >= qStart && position.column - 1 < qEnd) return raw;
  }
  return null;
}

async function resolveIncludePath(raw, currentFile) {
  let p = raw;
  if (!/\.[A-Za-z0-9]{1,8}$/.test(p)) p += '.typ';
  const dir = currentFile ? currentFile.split('/').slice(0, -1).join('/') : '';
  const candidates = [];
  if (dir && p !== dir + '/') candidates.push(dir + '/' + p);
  if (!candidates.includes(p)) candidates.push(p);
  for (const c of candidates) {
    try {
      const data = await fetchFile(c);
      return { path: c, content: data.content || '' };
    } catch {
      /* not found, try next */
    }
  }
  return null;
}

export function registerDefinitionProvider(monaco) {
  monaco.languages.registerDefinitionProvider('typst', {
    async provideDefinition(model, position) {
      const lineText = model.getLineContent(position.lineNumber);
      const includePath = findIncludePath(lineText, position);
      if (includePath) {
        const target = await resolveIncludePath(includePath, session.currentFile);
        if (target) {
          const uri = monaco.Uri.parse('file:///' + target.path);
          let targetModel = monaco.editor.getModel(uri);
          if (!targetModel) {
            try {
              targetModel = monaco.editor.createModel(target.content, 'typst', uri);
            } catch {
              return null;
            }
          }
          return { uri, range: new monaco.Range(1, 1, 1, 1) };
        }
      }
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const name = word.word;
      await buildDefinitionIndex();
      const hit = definitionIndex.get(name);
      if (!hit) return null;
      const currentPath = session.currentFile || 'main.typ';
      if (hit.path === currentPath && hit.line === position.lineNumber) return null;
      const targetUri = monaco.Uri.parse('file:///' + hit.path);
      let targetModel = monaco.editor.getModel(targetUri);
      if (!targetModel) {
        try {
          const data = await fetchFile(hit.path);
          targetModel = monaco.editor.createModel(data.content || '', 'typst', targetUri);
        } catch {
          return null;
        }
      }
      return {
        uri: targetUri,
        range: new monaco.Range(hit.line, 1, hit.line, 1),
      };
    },
  });

  monaco.editor.onDidCreateEditor(() => {});
}

export async function openDefinition(targetPath, line) {
  const { openFile } = await import('./editor-core.js');
  await openFile(targetPath);
  if (session.editor) {
    const pos = { lineNumber: line || 1, column: 1 };
    session.editor.revealLineInCenter(line || 1);
    session.editor.setPosition(pos);
    session.editor.focus();
  }
}
