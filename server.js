import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.join(__dirname, 'typst');
const CACHE_ROOT = path.join(__dirname, 'typst-cache');
const HISTORY_ROOT = path.join(CACHE_ROOT, 'history');
const DRAFTS_ROOT = path.join(CACHE_ROOT, 'drafts');
const HISTORY_LIMIT = 50;

for (const dir of [WORKSPACE, HISTORY_ROOT, DRAFTS_ROOT]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '10mb' }));

const sseClients = new Set();

function notifyFsChange(event, relPath) {
  const payload = JSON.stringify({ event, path: relPath || '' });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      /* ignore */
    }
  }
}

function resolveWorkspacePath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const full = path.resolve(WORKSPACE, filePath);
  const rel = path.relative(WORKSPACE, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

function safeCacheName(filePath) {
  return String(filePath).replace(/[\\/]/g, '__').replace(/[^\w.\-]/g, '_');
}

function historyDir(filePath) {
  return path.join(HISTORY_ROOT, safeCacheName(filePath));
}

function resolveHistorySnapshot(id) {
  if (typeof id !== 'string' || !id) return null;
  const full = path.resolve(HISTORY_ROOT, id);
  const rel = path.relative(HISTORY_ROOT, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!full.endsWith('.json')) return null;
  return full;
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/files', (req, res) => {
  try {
    const files = walkDir(WORKSPACE, '');
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const full = resolveWorkspacePath(filePath);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    const content = fs.readFileSync(full, 'utf-8');
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/file', (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  const full = resolveWorkspacePath(filePath);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    console.log(`[saved] ${filePath}`);
    notifyFsChange('change', filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const full = resolveWorkspacePath(filePath);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
    console.log(`[deleted] ${filePath}`);
    notifyFsChange('delete', filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/move', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const fullFrom = resolveWorkspacePath(from);
  const fullTo = resolveWorkspacePath(to);
  if (!fullFrom || !fullTo) return res.status(403).json({ error: 'forbidden' });
  try {
    if (!fs.existsSync(fullFrom)) return res.status(404).json({ error: `源不存在: ${from}` });
    if (fs.existsSync(fullTo)) return res.status(409).json({ error: `目标已存在: ${to}` });
    const dir = path.dirname(fullTo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(fullFrom, fullTo);
    console.log(`[moved] ${from} -> ${to}`);
    notifyFsChange('move', from);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/dir', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  const full = resolveWorkspacePath(dirPath);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    fs.mkdirSync(full, { recursive: true });
    console.log(`[mkdir] ${dirPath}`);
    notifyFsChange('mkdir', dirPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/dir', (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath) return res.status(400).json({ error: 'path required' });
  const full = resolveWorkspacePath(dirPath);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    if (!fs.existsSync(full)) return res.status(404).json({ error: `目录不存在: ${dirPath}` });
    const stat = fs.statSync(full);
    if (!stat.isDirectory()) return res.status(400).json({ error: `不是目录: ${dirPath}` });
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`[rmdir] ${dirPath}`);
    notifyFsChange('rmdir', dirPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const needle = String(q);
    const results = [];
    searchDir(WORKSPACE, '', needle, results, 500);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const dir = historyDir(filePath);
    if (!fs.existsSync(dir)) return res.json([]);
    const list = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { id: `${safeCacheName(filePath)}/${name}`, time: stat.mtimeMs, size: stat.size };
      })
      .sort((a, b) => b.time - a.time);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/history', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  try {
    const dir = historyDir(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const id = `${safeCacheName(filePath)}/${Date.now()}.json`;
    fs.writeFileSync(path.join(HISTORY_ROOT, id), JSON.stringify({ path: filePath, time: Date.now(), content }), 'utf-8');
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);
    while (files.length > HISTORY_LIMIT) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(dir, oldest));
    }
    res.json({ id, ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/snapshot', (req, res) => {
  const id = req.query.id;
  const full = resolveHistorySnapshot(id);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
    res.json({ id, path: data.path, time: data.time, content: data.content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/history', (req, res) => {
  const id = req.query.id;
  const full = resolveHistorySnapshot(id);
  if (!full) return res.status(403).json({ error: 'forbidden' });
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/draft', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  try {
    const full = path.join(DRAFTS_ROOT, safeCacheName(filePath) + '.json');
    fs.writeFileSync(full, JSON.stringify({ path: filePath, time: Date.now(), content }), 'utf-8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/draft', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const full = path.join(DRAFTS_ROOT, safeCacheName(filePath) + '.json');
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'no draft' });
    const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
    res.json({ path: data.path, time: data.time, content: data.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/draft', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const full = path.join(DRAFTS_ROOT, safeCacheName(filePath) + '.json');
    if (fs.existsSync(full)) fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/packages', express.static(path.join(__dirname, '/packages'), {
  // 2. 强制设置正确的 Content-Type 和 Encoding
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.tar.gz')) {
      // 告诉浏览器这是 gzip 压缩的二进制流，不要尝试解压或转换
      res.setHeader('Content-Encoding', 'identity');
      res.setHeader('Content-Type', 'application/gzip');
    }
  }
}));

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(3000, () => {
    console.log(`Typst Editor running at http://localhost:3000`);
    console.log(`Workspace: ${WORKSPACE}`);
  });
}

function walkDir(dir, rel) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      entries.push({ name, path: relPath, type: 'directory', children: walkDir(full, relPath) });
    } else {
      entries.push({ name, path: relPath, type: 'file' });
    }
  }
  return entries;
}

function searchDir(dir, rel, needle, results, maxResults) {
  if (results.length >= maxResults) return;
  for (const name of fs.readdirSync(dir)) {
    if (results.length >= maxResults) return;
    const full = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      searchDir(full, relPath, needle, results, maxResults);
    } else {
      if (!relPath.endsWith('.typ')) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const idx = lines[i].indexOf(needle);
          if (idx !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(lines[i].length, idx + needle.length + 60);
            results.push({
              path: relPath,
              line: i + 1,
              col: idx + 1,
              preview: (start > 0 ? '…' : '') + lines[i].slice(start, end) + (end < lines[i].length ? '…' : ''),
            });
            if (results.length >= maxResults) return;
          }
        }
      } catch {
        /* ignore unreadable files */
      }
    }
  }
}

let watchStarted = false;
function startFsWatch() {
  if (watchStarted) return;
  watchStarted = true;
  try {
    fs.watch(WORKSPACE, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const rel = filename.split(path.sep).join('/');
      notifyFsChange(event, rel);
    });
    console.log('[watch] workspace watching enabled');
  } catch (err) {
    console.warn('[watch] failed to enable:', err.message);
  }
}

start();
