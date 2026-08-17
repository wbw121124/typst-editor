import { session } from './state.js';
import { scrollPreviewToPosition } from './navigation.js';

const HEADING_RE = /^(\s*)(={1,6})\s+(.*)$/;
const LET_RE = /^\s*#let\s+([A-Za-z_][\w-]*)\s*(?:\([^)]*\))?\s*=/;
const IMPORT_RE = /^\s*#import\s+["'`]([^"'`]+)["'`]/;
const LABEL_RE = /<([A-Za-z_][\w-]*)>/;
const FUNC_DEF_RE = /^\s*#(?:let|fn)?\s*$/;

const PARA_BREAK_RE = /^={1,6}\s/;
const PARA_COMMENT_RE = /^\s*\/\//;
const PARA_BLOCK_COMMENT_RE = /^\s*\/\*/;
const PARA_DEF_RE = /^\s*#(?:let|import|set|show)\b/;
const PARA_CMD_RE = /^\s*#/;
const PARA_LIST_RE = /^\s*[-+]\s+/;
const PARA_MATH_RE = /^\s*\$[^\n]*\$\s*$/;
const PARA_MATH_OPEN_RE = /^\s*\$[^$\n]*$/;
const PARA_FENCE_RE = /^\s*```/;
const PARA_RULE_RE = /^\s*(?:-{3,}|_{3,})\s*$/;
const PARA_LABEL_RE = /^\s*<[A-Za-z_][\w-]*>\s*$/;

const MAX_PARAGRAPHS = 500;

let paragraphPreviewLength = 10;

export function configureOutline(cfg) {
  const n = cfg && cfg.outline && Number(cfg.outline.paragraphPreviewLength);
  if (Number.isFinite(n) && n > 0) paragraphPreviewLength = Math.floor(n);
}

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

export function parseParagraphs(text, maxLength = paragraphPreviewLength) {
  const paragraphs = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let active = null;
  let inCode = false;
  let inBlockComment = false;
  let inMath = false;

  const flush = () => {
    if (!active || active.lines.length === 0) return;
    const preview = cleanParagraphText(active.lines);
    if (preview) {
      paragraphs.push({ line: active.line, text: preview.slice(0, Math.max(1, maxLength)) });
    }
    active = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (inCode) {
      if (PARA_FENCE_RE.test(line)) inCode = false;
      flush();
      continue;
    }
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      flush();
      continue;
    }
    if (inMath) {
      if (line.includes('$')) inMath = false;
      flush();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (PARA_FENCE_RE.test(line)) {
      inCode = true;
      flush();
      continue;
    }
    if (PARA_BLOCK_COMMENT_RE.test(line)) {
      if (!line.includes('*/')) inBlockComment = true;
      flush();
      continue;
    }
    if (
      PARA_BREAK_RE.test(line) ||
      PARA_COMMENT_RE.test(line) ||
      PARA_DEF_RE.test(line) ||
      PARA_LIST_RE.test(line) ||
      PARA_RULE_RE.test(line) ||
      PARA_LABEL_RE.test(line)
    ) {
      flush();
      continue;
    }
    if (PARA_MATH_RE.test(line)) {
      flush();
      continue;
    }
    if (PARA_MATH_OPEN_RE.test(line)) {
      inMath = true;
      flush();
      continue;
    }
    if (PARA_CMD_RE.test(line)) {
      if (!active) flush();
      continue;
    }
    if (!active) active = { line: i + 1, lines: [] };
    active.lines.push(raw.trim());
  }
  flush();
  return paragraphs;
}

function cleanParagraphText(lines) {
  let text = lines.join(' ');
  text = text
    .replace(/#[A-Za-z_][\w-]*(?:\([^)]*\))?|#\([^)]*\)|#\[[^\]]*\]/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<[A-Za-z_][\w-]*>/g, ' ')
    .replace(/@[A-Za-z_][\w-]*/g, ' ')
    .replace(/[*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function jumpToSource(line, column) {
  if (session.editor) {
    const pos = { lineNumber: line, column: column || 1 };
    session.editor.revealLineInCenter(line);
    session.editor.setPosition(pos);
    session.editor.focus();
  }
  if (session.previewMode === 'pdf' && session.editor) {
    const model = session.editor.getModel();
    const source = model ? model.getValue() : '';
    const filePath = session.currentFile || 'main.typ';
    scrollPreviewToPosition(filePath, source, line, column || 1);
  }
}

export function renderOutlinePanel(container, symbols, paragraphs = []) {
  container.innerHTML = '';
  if ((!symbols || symbols.length === 0) && (!paragraphs || paragraphs.length === 0)) {
    container.innerHTML = '<div class="outline-empty">当前文件没有可显示的大纲</div>';
    return;
  }
  const walk = (items) => {
    for (const sym of items) {
      const el = document.createElement('div');
      el.className = 'outline-item';
      el.style.paddingLeft = `${8 + Math.min(4, sym.level - 1) * 14}px`;
      el.textContent = sym.name;
      el.title = `第 ${sym.line} 行`;
      el.addEventListener('click', () => jumpToSource(sym.line, sym.column));
      container.appendChild(el);
      walk(sym.children || []);
    }
  };
  walk(symbols);
  if (paragraphs && paragraphs.length > 0) {
    const group = document.createElement('div');
    group.className = 'outline-group collapsed';
    const header = document.createElement('div');
    header.className = 'outline-group-header';
    header.textContent = `段落 (${paragraphs.length})`;
    header.addEventListener('click', () => group.classList.toggle('collapsed'));
    const body = document.createElement('div');
    body.className = 'outline-group-body';
    const shown = paragraphs.slice(0, MAX_PARAGRAPHS);
    for (const p of shown) {
      const el = document.createElement('div');
      el.className = 'outline-item outline-item-para';
      el.textContent = p.text;
      el.title = `第 ${p.line} 行 · 段落`;
      el.addEventListener('click', () => jumpToSource(p.line, 1));
      body.appendChild(el);
    }
    if (paragraphs.length > MAX_PARAGRAPHS) {
      const more = document.createElement('div');
      more.className = 'outline-empty';
      more.textContent = `… 仅显示前 ${MAX_PARAGRAPHS} 段`;
      body.appendChild(more);
    }
    group.appendChild(header);
    group.appendChild(body);
    container.appendChild(group);
  }
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
  const text = model.getValue();
  const symbols = parseOutline(text);
  const paragraphs = parseParagraphs(text);
  renderOutlinePanel(panel, symbols, paragraphs);
}

export { FUNC_DEF_RE };
