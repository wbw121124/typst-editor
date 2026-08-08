import { session } from './state.js';
import { getProject, isReady } from './typst-project.js';

let hlTimer = null;
let hlSeq = 0;
let decorationIds = [];

const HL_TAG_STYLES = `
.typ-key { color: #569cd6 !important; }
.typ-func { color: #dcdcaa !important; }
.typ-var { color: #9cdcfe !important; }
.typ-param { color: #9cdcfe !important; }
.typ-type { color: #4ec9b0 !important; }
.typ-str { color: #ce9178 !important; }
.typ-comment { color: #6a9955 !important; font-style: italic !important; }
.typ-op { color: #d4d4d4 !important; }
.typ-punct { color: #d4d4d4 !important; }
.typ-math { color: #d4d4d4 !important; }
.typ-raw { color: #ce9178 !important; }
.typ-heading { color: #569cd6 !important; font-weight: bold !important; }
.typ-strong { color: #569cd6 !important; font-weight: bold !important; }
.typ-emph { font-style: italic !important; }
.typ-escape { color: #d7ba7d !important; }
.typ-ref { color: #4fc1ff !important; }
.typ-label { color: #9cdcfe !important; }
.typ-imp { color: #569cd6 !important; }
.typ-markup { color: #d4d4d4 !important; }
.typ-link { color: #4fc1ff !important; text-decoration: underline !important; }
`;

function ensureHlStyle() {
  if (document.getElementById('typst-hl-colors')) return;
  const style = document.createElement('style');
  style.id = 'typst-hl-colors';
  style.textContent = HL_TAG_STYLES;
  document.head.appendChild(style);
}

function offsetsToRanges(source, spans) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const ranges = [];
  for (const s of spans) {
    let line = 0;
    let from = Math.min(Math.max(0, s.from), source.length);
    let to = Math.min(Math.max(from, s.to), source.length);
    const fi = from;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= fi) line++;
    const startLine = line + 1;
    const startCol = fi - lineStarts[line] + 1;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= to) line++;
    const endLine = line + 1;
    const endCol = to - lineStarts[line] + 1;
    ranges.push({
      startLineNumber: startLine,
      startColumn: startCol,
      endLineNumber: endLine,
      endColumn: endCol,
      className: s.tag,
    });
  }
  return ranges;
}

async function applyHighlight() {
  const model = session.editor && session.editor.getModel();
  if (!model) return;
  const seq = ++hlSeq;
  const source = model.getValue();
  try {
    const project = getProject();
    if (!project) return;
    const spans = await project.highlight(source);
    if (seq !== hlSeq) return;
    if (model.isDisposed()) return;
    const ranges = offsetsToRanges(source, spans);
    const decorations = ranges.map((r) => ({
      range: new window.monaco.Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn),
      options: { inlineClassName: r.className },
    }));
    const editor = session.editor;
    decorationIds = editor.deltaDecorations(decorationIds, decorations);
  } catch (err) {
    if (seq !== hlSeq) return;
    if (!model.isDisposed()) {
      const editor = session.editor;
      decorationIds = editor.deltaDecorations(decorationIds, []);
    }
    console.warn('[Highlight] service highlight failed, fallback to TM:', err.message || err);
  }
}

export function setupServiceHighlight(monaco, editor) {
  ensureHlStyle();
  editor.onDidChangeModelContent(() => {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(() => {
      applyHighlight();
    }, 250);
  });
  editor.onDidChangeModel(() => {
    decorationIds = [];
    clearTimeout(hlTimer);
    hlTimer = setTimeout(() => {
      applyHighlight();
    }, 100);
  });
}

export function refreshServiceHighlight() {
  clearTimeout(hlTimer);
  applyHighlight();
}

export function isServiceReady() {
  return isReady() && !!getProject();
}
