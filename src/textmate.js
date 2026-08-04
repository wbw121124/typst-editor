import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { Registry, INITIAL, parseRawGrammar } from 'vscode-textmate';

let registry = null;

const DARK_PLUS_THEME = {
  name: 'Dark+ (default dark)',
  settings: [
    { settings: { foreground: '#D4D4D4', background: '#1E1E1E' } },
    { name: 'Function declarations', scope: ['entity.name.function', 'support.function'], settings: { foreground: '#DCDCAA' } },
    { name: 'Types', scope: ['support.type', 'entity.name.type', 'entity.name.namespace', 'entity.name.class', 'entity.other.attribute'], settings: { foreground: '#4EC9B0' } },
    { name: 'Control flow', scope: ['keyword.control', 'entity.name.operator'], settings: { foreground: '#C586C0' } },
    { name: 'Variables', scope: ['variable', 'meta.definition.variable.name', 'support.variable', 'entity.name.variable'], settings: { foreground: '#9CDCFE' } },
    { name: 'Constants', scope: ['variable.other.constant', 'variable.other.enummember'], settings: { foreground: '#51B6C4' } },
    { scope: 'emphasis', settings: { fontStyle: 'italic' } },
    { scope: 'strong', settings: { fontStyle: 'bold' } },
    { scope: 'comment', settings: { foreground: '#6A9955', fontStyle: 'italic' } },
    { scope: 'constant.language', settings: { foreground: '#569cd6' } },
    { scope: ['constant.numeric'], settings: { foreground: '#b5cea8' } },
    { scope: 'constant.character.escape', settings: { foreground: '#d7ba7d' } },
    { scope: 'entity.name.tag', settings: { foreground: '#569cd6' } },
    { scope: 'entity.other.attribute-name', settings: { foreground: '#9cdcfe' } },
    { scope: 'markup.bold', settings: { fontStyle: 'bold', foreground: '#569cd6' } },
    { scope: 'markup.heading', settings: { fontStyle: 'bold', foreground: '#569cd6' } },
    { scope: 'markup.italic', settings: { fontStyle: 'italic' } },
    { scope: 'markup.inline.raw', settings: { foreground: '#ce9178' } },
    { scope: 'punctuation.definition.tag', settings: { foreground: '#808080' } },
    { scope: 'storage', settings: { foreground: '#569cd6' } },
    { scope: 'storage.type', settings: { foreground: '#569cd6' } },
    { scope: ['string', 'meta.embedded.assembly'], settings: { foreground: '#ce9178' } },
    { scope: 'string.regexp', settings: { foreground: '#d16969' } },
    { scope: 'keyword', settings: { foreground: '#569cd6' } },
    { scope: 'keyword.operator', settings: { foreground: '#d4d4d4' } },
    { scope: 'keyword.operator.new', settings: { foreground: '#569cd6' } },
    { scope: 'keyword.other.unit', settings: { foreground: '#b5cea8' } },
    { scope: 'variable.language', settings: { foreground: '#569cd6' } },
    { scope: 'invalid', settings: { foreground: '#f44747' } },
    { scope: 'support.module.typst', settings: { foreground: '#569cd6' } }
  ],
};

async function loadOnigurumaWASM() {
  const response = await fetch('/onig.wasm');
  const contentType = response.headers.get('content-type');
  let data;
  if (contentType === 'application/wasm') {
    data = response;
  } else {
    data = await response.arrayBuffer();
  }
  await loadWASM(data);
  return { createOnigScanner, createOnigString };
}

export async function initTextMateGrammar() {
  const onigLib = loadOnigurumaWASM();

  registry = new Registry({
    onigLib,
    theme: DARK_PLUS_THEME,
    async loadGrammar(scopeName) {
      if (scopeName === 'source.typst') {
        const response = await fetch('/typst.tmLanguage.json');
        const content = await response.text();
        return parseRawGrammar(content, 'typst.tmLanguage.json');
      }
      return null;
    },
  });

  return registry;
}

export async function registerTextMateLanguage(monaco, languageId, scopeName) {
  if (!registry) {
    throw new Error('TextMate grammar not initialized');
  }

  const encodedLanguageId = monaco.languages.getEncodedLanguageId(languageId);

  const grammar = await registry.loadGrammarWithConfiguration(
    scopeName,
    encodedLanguageId,
    {},
  );

  if (!grammar) {
    throw new Error(`Failed to load grammar for ${scopeName}`);
  }

  // Inject color map via Monaco's AMD require
  injectColorMapViaRequire(registry);

  monaco.languages.setTokensProvider(languageId, {
    getInitialState() {
      return INITIAL;
    },
    tokenizeEncoded(line, state) {
      const result = grammar.tokenizeLine2(line, state);
      return { tokens: result.tokens, endState: result.ruleStack };
    },
  });

  return grammar;
}

function injectColorMapViaRequire(registry) {
  const colorMap = registry.getColorMap();
  if (!colorMap || colorMap.length === 0) return;

  // Update Monaco's tokenization registry; always fall back to CSS injection.
  if (typeof window.require === 'function') {
    try {
      window.require(
        ['vs/editor/common/tokenizationRegistry'],
        function (tokenizationRegistry) {
          const tr = tokenizationRegistry && tokenizationRegistry.TokenizationRegistry;
          if (tr) {
            const setter =
              typeof tr.setColorMap === 'function'
                ? tr.setColorMap.bind(tr)
                : typeof tr._setColorMap === 'function'
                  ? tr._setColorMap.bind(tr)
                  : null;
            if (setter) setter(colorMap);
          }
          // Generate and inject CSS
          injectColorMapCSS(colorMap);
        },
      );
    } catch (e) {
      injectColorMapCSS(colorMap);
    }
  } else {
    injectColorMapCSS(colorMap);
  }
}

function injectColorMapCSS(colorMap) {
  // Remove old style if exists
  const old = document.getElementById('typst-tm-colors');
  if (old) old.remove();

  const cssRules = [];
  for (let i = 0; i < colorMap.length; i++) {
    const color = colorMap[i];
    if (color) {
      cssRules.push(`.mtk${i} { color: ${color} !important; }`);
    }
  }
  cssRules.push(`.mtk17 { color: #e8ab53 !important; }`);
  cssRules.push(`.mtk18 { color: #e8ab53 !important; }`);

  const style = document.createElement('style');
  style.id = 'typst-tm-colors';
  style.innerHTML = cssRules.join('\n');

  const monacoColors = document.getElementsByClassName('monaco-colors')[0];
  if (monacoColors && monacoColors.parentElement) {
    monacoColors.parentElement.insertBefore(style, monacoColors.nextSibling);
  } else {
    document.head.appendChild(style);
  }
}
