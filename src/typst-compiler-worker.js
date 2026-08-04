import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/index.mjs';

self.addEventListener('message', async (event) => {
  const { id, mainContent, format = 'vector' } = event.data;
  try {
    let result;
    if (format === 'svg') {
      result = await $typst.svg({ mainContent });
    } else if (format === 'pdf') {
      result = await $typst.pdf({ mainContent });
    } else {
      result = await $typst.vector({ mainContent });
    }

    if (typeof result === 'string') {
      self.postMessage({ id, ok: true, data: result });
      return;
    }

    const bytes = result instanceof Uint8Array ? result : new Uint8Array(result);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({ id, ok: true, data: bytes }, [buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err && (err.message || String(err))) || 'unknown' });
  }
});

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