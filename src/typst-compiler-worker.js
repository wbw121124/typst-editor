import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';
import { CompileFormatEnum } from '@myriaddreamin/typst.ts/dist/esm/compiler.mjs';

const MAIN_PATH = '/worker-main.typ';

let current = null;
let pending = null;

self.addEventListener('message', (event) => {
  const req = event.data;
  if (current) {
    if (req.format === 'vector') {
      current.superseded = true;
    }
    pending = req;
  } else if (pending) {
    pending = req;
  } else {
    pending = req;
  }
  pump();
});

async function pump() {
  if (current || !pending) return;
  const req = pending;
  pending = null;
  current = req;
  try {
    const result = await doCompile(req);
    postResult(req, result);
  } catch (err) {
    if (!current.superseded) {
      self.postMessage({
        id: req.id,
        ok: false,
        error: (err && (err.message || String(err))) || 'unknown',
      });
    }
  } finally {
    current = null;
    pump();
  }
}

function postResult(req, result) {
  if (current.superseded) {
    self.postMessage({ id: req.id, ok: false, cancelled: true });
    return;
  }
  if (typeof result === 'string') {
    self.postMessage({ id: req.id, ok: true, data: result });
    return;
  }
  const bytes = result instanceof Uint8Array ? result : new Uint8Array(result);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  self.postMessage({ id: req.id, ok: true, data: bytes }, [buffer]);
}

async function doCompile(req) {
  const compiler = await getCompiler();
  compiler.addSource(MAIN_PATH, req.mainContent);

  if (req.format === 'vector') {
    if (lastContent === req.mainContent && lastVectorData) {
      return lastVectorData;
    }
    const res = await compiler.compile({
      mainFilePath: MAIN_PATH,
      diagnostics: 'none',
    });
    const data = res.result;
    lastContent = req.mainContent;
    lastVectorData = data;
    return data;
  }

  if (req.format === 'pdf') {
    const res = await compiler.compile({
      mainFilePath: MAIN_PATH,
      format: CompileFormatEnum.pdf,
      diagnostics: 'none',
    });
    return res.result;
  }

  throw new Error(`unknown format: ${req.format}`);
}

let compilerPromise = null;
let lastContent = null;
let lastVectorData = null;

function getCompiler() {
  if (!compilerPromise) compilerPromise = $typst.getCompiler();
  return compilerPromise;
}

const base = self.location.origin + '/packages/';
const accessModel = new MemoryAccessModel();
self.packageCache = new Map();

const provider = TypstSnippet.fetchPackageBy(accessModel, (spec) => {
  const url = `${base}@${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;
  try {
    const request = new XMLHttpRequest();
    request.overrideMimeType('text/plain; charset=x-user-defined');
    request.open('GET', url, false);
    request.send(null);
    if (request.status === 200 && typeof request.response === 'string') {
      return Uint8Array.from(request.response, (c) => c.charCodeAt(0));
    }
    return undefined;
  } catch (e) {
    console.error(`Failed to fetch ${url}:`, e);
  }
  return undefined;
});

$typst.use(
  TypstSnippet.preloadFonts([
    '/fonts/NotoSansCJKsc-Regular.otf',
    '/fonts/NotoSerifCJKsc-Regular.otf',
    '/fonts/LXGWWenKai-Regular.ttf',
    '/fonts/InriaSerif-Regular.ttf',
    '/fonts/InriaSerif-Bold.ttf',
    '/fonts/InriaSerif-Italic.ttf',
    '/fonts/InriaSerif-BoldItalic.ttf',
    '/fonts/Roboto-Regular.ttf',
    '/fonts/JetBrainsMono-Regular.ttf',
  ]),
  TypstSnippet.withAccessModel(accessModel),
  provider,
);

$typst.setCompilerInitOptions({
  getModule: () =>
    fetch('/typst-wasm/typst_ts_web_compiler_bg.wasm').then((r) => r.arrayBuffer()),
});