import { session } from './state.js';

const HEADING_RE = /^(\s*)(={1,6})\s+(.*)$/;
const LET_RE = /^\s*#let\s+([A-Za-z_][\w-]*)\s*(?:\([^)]*\))?\s*=/;
const IMPORT_RE = /^\s*#import\s+["'`]([^"'`]+)["'`]/;
const LABEL_RE = /<([A-Za-z_][\w-]*)>/;
const FUNC_DEF_RE = /^\s*#(?:let|fn)?\s*$/;

export function parseOutline(text) {
  const symbols = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let stack = [];
  const findParent = (level) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    return stack.length > 0 ? stack[stack.length - 1] : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = HEADING_RE.exec(line);
    if (m) {
      const level = m[2].length;
      const title = m[3].trim();
      const parent = findParent(level);
      const sym = {
        name: title,
        kind: 1,
        line: i + 1,
        column: m[1].length + 1,
        level,
        children: [],
      };
      if (parent) parent.children.push(sym);
      else symbols.push(sym);
      stack = stack.filter((s) => s.level < level);
      stack.push(sym);
      continue;
    }
    const lm = LET_RE.exec(line);
    if (lm) {
      symbols.push({
        name: lm[1],
        kind: 4,
        line: i + 1,
        column: line.indexOf(lm[1]) + 1,
        level: 99,
        children: [],
      });
      continue;
    }
    const im = IMPORT_RE.exec(line);
    if (im) {
      symbols.push({
        name: `import ${im[1]}`,
        kind: 3,
        line: i + 1,
        column: line.indexOf(im[1]) + 1,
        level: 99,
        children: [],
      });
      continue;
    }
    const lab = LABEL_RE.exec(line);
    if (lab) {
      symbols.push({
        name: `<${lab[1]}>`,
        kind: 7,
        line: i + 1,
        column: line.indexOf(`<${lab[1]}>`) + 1,
        level: 99,
        children: [],
      });
    }
  }
  return symbols;
}

export function renderOutlinePanel(container, symbols) {
  container.innerHTML = '';
  if (!symbols || symbols.length === 0) {
    container.innerHTML = '<div class="outline-empty">当前文件没有可显示的大纲</div>';
    return;
  }
  const walk = (items) => {
    for (const sym of items) {
      const el = document.createElement('div');
      el.className = 'outline-item';
      el.dataset.line = sym.line;
      el.style.paddingLeft = `${8 + Math.min(4, sym.level - 1) * 14}px`;
      el.textContent = sym.name;
      el.title = `第 ${sym.line} 行`;
      el.addEventListener('click', () => {
        if (session.editor) {
          const pos = { lineNumber: sym.line, column: sym.column };
          session.editor.revealLineInCenter(sym.line);
          session.editor.setPosition(pos);
          session.editor.focus();
        }
      });
      container.appendChild(el);
      walk(sym.children || []);
    }
  };
  walk(symbols);
}

export function registerDocumentSymbolProvider(monaco) {
  monaco.languages.registerDocumentSymbolProvider('typst', {
    provideDocumentSymbols(model) {
      const symbols = parseOutline(model.getValue());
      return symbols.map((s) => toMonacoSymbol(s));
    },
  });
}

function toMonacoSymbol(sym) {
  const start = { lineNumber: sym.line, column: sym.column };
  const end = { lineNumber: sym.line, column: sym.column + Math.max(1, sym.name.length) };
  return {
    name: sym.name,
    detail: '',
    kind: sym.kind,
    tags: [],
    range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
    selectionRange: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
    children: (sym.children || []).map((c) => toMonacoSymbol(c)),
  };
}

export function updateOutlinePanel() {
  const panel = document.getElementById('outline-panel');
  if (!panel || panel.parentElement.classList.contains('hidden')) return;
  const model = session.editor && session.editor.getModel();
  if (!model) {
    panel.innerHTML = '<div class="outline-empty">未打开文件</div>';
    return;
  }
  const symbols = parseOutline(model.getValue());
  renderOutlinePanel(panel, symbols);
}

export { FUNC_DEF_RE };
