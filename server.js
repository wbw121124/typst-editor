import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.join(__dirname, 'typst');

if (!fs.existsSync(WORKSPACE)) {
  fs.mkdirSync(WORKSPACE, { recursive: true });
}

const app = express();
app.use(express.json({ limit: '10mb' }));

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
  const full = path.join(WORKSPACE, filePath);
  if (!full.startsWith(WORKSPACE)) return res.status(403).json({ error: 'forbidden' });
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
  const full = path.join(WORKSPACE, filePath);
  if (!full.startsWith(WORKSPACE)) return res.status(403).json({ error: 'forbidden' });
  try {
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    console.log(`[saved] ${filePath}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const full = path.join(WORKSPACE, filePath);
  if (!full.startsWith(WORKSPACE)) return res.status(403).json({ error: 'forbidden' });
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
    console.log(`[deleted] ${filePath}`);
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

start();
