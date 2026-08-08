import { TypstProject } from '@vedivad/typst-web-service';
import { FONT_PATHS } from './fonts.js';

let project = null;
let projectReady = false;

export async function initProject(entry = '/main.typ') {
  const statusEl = document.getElementById('preview-status');
  statusEl.textContent = '正在加载 WASM 引擎...';

  try {
    project = await TypstProject.create({
      entry,
      autoCompile: { debounceMs: 500, maxWaitMs: 2000 },
    });

    await loadFonts(project);

    projectReady = true;
    statusEl.textContent = 'WASM 引擎就绪';
    console.log('[TypstProject] Initialized');
    return project;
  } catch (err) {
    statusEl.textContent = 'WASM 引擎加载失败: ' + (err.message || err);
    console.error('[TypstProject] Init failed:', err);
    throw err;
  }
}

async function loadFonts(proj) {
  const fontPaths = FONT_PATHS;

  for (const fontPath of fontPaths) {
    try {
      const resp = await fetch(fontPath);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        await proj.addFont(new Uint8Array(buf));
        console.log(`[TypstProject] Loaded font: ${fontPath}`);
      }
    } catch (e) {
      console.warn(`[TypstProject] Failed to load font ${fontPath}:`, e);
    }
  }
}

export function getProject() {
  return project;
}

export function isReady() {
  return projectReady;
}

export async function syncFile(path, content) {
  if (!project) return;
  const vfsPath = path.startsWith('/') ? path : `/${path}`;
  await project.setText(vfsPath, content);
}

export async function syncFiles(files) {
  if (!project) return;
  const mapped = {};
  for (const [path, content] of Object.entries(files)) {
    const vfsPath = path.startsWith('/') ? path : `/${path}`;
    mapped[vfsPath] = content;
  }
  await project.setMany(mapped);
}

export async function removeFile(path) {
  if (!project) return;
  const vfsPath = path.startsWith('/') ? path : `/${path}`;
  await project.remove(vfsPath);
}

export async function getCompletions(path, source, offset, explicit = false) {
  if (!project) return undefined;
  const vfsPath = path.startsWith('/') ? path : `/${path}`;
  return project.completion(vfsPath, source, offset, explicit);
}

export async function getHover(path, source, offset) {
  if (!project) return undefined;
  const vfsPath = path.startsWith('/') ? path : `/${path}`;
  return project.hover(vfsPath, source, offset);
}

export async function getFormat(path, source) {
  if (!project) return undefined;
  const vfsPath = path.startsWith('/') ? path : `/${path}`;
  return project.format(vfsPath, source);
}

export async function compileProject() {
  if (!project) return undefined;
  return project.compile();
}

export async function renderPage(index) {
  if (!project) return undefined;
  return project.renderPage(index);
}

export async function renderPages(start, end) {
  if (!project) return [];
  return project.renderedPages(start, end);
}

export async function exportPdf() {
  if (!project) return undefined;
  return project.exportPdf();
}

export async function renderToCanvas(canvas, pageNum = 0) {
  if (!project) return false;
  try {
    const result = await project.compile();
    if (!result || !result.pages || result.pages.length === 0) return false;

    const svgStr = await project.renderPage(pageNum);
    if (!svgStr) return false;

    const pageInfo = result.pages[pageNum];
    const pageWidthPt = pageInfo?.width || 595;
    const pageHeightPt = pageInfo?.height || 842;

    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      img.onload = () => {
        const scale = canvas.clientWidth / pageWidthPt;
        canvas.width = canvas.clientWidth;
        canvas.height = pageHeightPt * scale;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  } catch (e) {
    console.warn('[TypstProject] renderToCanvas failed:', e);
    return false;
  }
}

export async function renderToSvg(pageNum = 0) {
  if (!project) return undefined;
  try {
    await project.compile();
    return await project.renderPage(pageNum);
  } catch (e) {
    console.warn('[TypstProject] renderToSvg failed:', e);
    return undefined;
  }
}

export function onCompile(listener) {
  if (!project) return () => {};
  return project.onCompile(listener);
}

export function destroyProject() {
  if (project) {
    project.destroy();
    project = null;
    projectReady = false;
  }
}
