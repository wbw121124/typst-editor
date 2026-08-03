import { getProject, isReady, getCompletions, getHover, getFormat, onCompile } from './typst-project.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteToCharOffset(text, byteOffset) {
  if (byteOffset <= 0) return 0;
  const bytes = encoder.encode(text);
  if (byteOffset >= bytes.length) return text.length;
  return decoder.decode(bytes.subarray(0, byteOffset)).length;
}

const COMPLETION_KIND_MAP = {
  func: 0,
  type: 1,
  constant: 3,
  param: 5,
  syntax: 1,
  path: 17,
  package: 17,
  label: 1,
  font: 1,
  symbol: 12,
};

function offsetToPosition(model, offset) {
  const text = model.getValue();
  const before = text.substring(0, offset);
  const lines = before.split('\n');
  const lineNumber = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { lineNumber, column };
}

function positionToOffset(model, position) {
  const text = model.getValue();
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < position.lineNumber - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  offset += position.column - 1;
  return offset;
}

function severityToMonaco(severity) {
  return severity === 'error' ? 8 : 4;
}

function rangeFromLocation(loc, model) {
  if (!loc) return null;
  const startLine = loc.line || 1;
  const startCol = loc.column || 1;
  const startOffset = loc.start || 0;
  const endOffset = loc.end || startOffset;
  const startPos = offsetToPosition(model, startOffset);
  const endPos = offsetToPosition(model, endOffset);
  return {
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
  };
}

export function registerLspFeatures(monaco, editor) {
  registerCompletionProvider(monaco, editor);
  registerHoverProvider(monaco, editor);
  registerFormattingProvider(monaco, editor);
  registerDiagnosticsHandler(monaco, editor);
}

function registerCompletionProvider(monaco, editor) {
  monaco.languages.registerCompletionItemProvider('typst', {
    triggerCharacters: ['.', '(', '#', ':', '@', '"', '/'],
    async provideCompletionItems(model, position, context) {
      if (!isReady()) return { suggestions: [] };

      const offset = positionToOffset(model, position);
      const source = model.getValue();
      const filePath = editor._currentFile || '/main.typ';

      try {
        const result = await getCompletions(filePath, source, offset, context.triggerKind === 1);
        if (!result || !result.completions) return { suggestions: [] };

        const fromCharOffset = byteToCharOffset(source, result.from);

        const suggestions = result.completions.map((item) => {
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: position.column - (offset - fromCharOffset),
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };

          return {
            label: item.label,
            kind: COMPLETION_KIND_MAP[item.kind] || 1,
            insertText: item.apply || item.label,
            detail: item.detail,
            range,
          };
        });

        return { suggestions };
      } catch (e) {
        console.warn('[LSP] Completion error:', e);
        return { suggestions: [] };
      }
    },
  });
}

function registerHoverProvider(monaco, editor) {
  monaco.languages.registerHoverProvider('typst', {
    async provideHover(model, position) {
      if (!isReady()) return null;

      const offset = positionToOffset(model, position);
      const source = model.getValue();
      const filePath = editor._currentFile || '/main.typ';

      try {
        const hover = await getHover(filePath, source, offset);
        if (!hover) return null;

        const value = hover.kind === 'code'
          ? { value: hover.value, language: 'typst' }
          : hover.value;

        return {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          contents: [{ value }],
        };
      } catch (e) {
        console.warn('[LSP] Hover error:', e);
        return null;
      }
    },
  });
}

function registerFormattingProvider(monaco, editor) {
  monaco.languages.registerDocumentFormattingEditProvider('typst', {
    async provideDocumentFormattingEdits(model) {
      if (!isReady()) return [];

      const source = model.getValue();
      const filePath = editor._currentFile || '/main.typ';

      try {
        const formatted = await getFormat(filePath, source);
        if (!formatted || formatted === source) return [];

        const fullRange = model.getFullModelRange();
        return [{
          range: fullRange,
          text: formatted,
        }];
      } catch (e) {
        console.warn('[LSP] Format error:', e);
        return [];
      }
    },
  });
}

function registerDiagnosticsHandler(monaco, editor) {
  onCompile((result) => {
    if (!result || !result.diagnostics) return;

    const model = editor.getModel();
    if (!model) return;

    const markers = result.diagnostics.map((diag) => {
      let range;
      if (diag.location) {
        range = rangeFromLocation(diag.location, model);
      }

      if (!range) {
        range = {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        };
      }

      const message = diag.message + (diag.hints && diag.hints.length > 0
        ? '\n' + diag.hints.join('\n')
        : '');

      return {
        severity: severityToMonaco(diag.severity),
        message,
        ...range,
      };
    });

    monaco.editor.setModelMarkers(model, 'typst', markers);
  });
}
