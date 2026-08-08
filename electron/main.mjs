import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const isDev = process.env.ELECTRON_DEV === '1';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let mainWindow = null;
let httpServer = null;
let workspaceRoot = null;

function readConfigSectionValue(raw, section, key) {
  const secMatch = raw.match(new RegExp(`^\\s*${section}:\\s*$[\\r\\n]+([\\s\\S]*?)(?=^\\S|$)`, 'm'));
  if (!secMatch) return null;
  const km = secMatch[1].match(new RegExp(`^\\s{2,}${key}\\s*:\\s*([^#\\r\\n]+)`, 'm'));
  return km ? km[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function boot() {
  if (app.isPackaged) {
    const userData = app.getPath('userData');
    const configPath = path.join(userData, 'config.yml');
    if (!fs.existsSync(configPath)) {
      const bundled = path.join(process.resourcesPath, 'config.yml');
      if (fs.existsSync(bundled)) fs.copyFileSync(bundled, configPath);
    }
    process.env.TYPST_CONFIG = configPath;
    process.env.TYPST_PACKAGES = path.join(process.resourcesPath, 'packages');
    workspaceRoot = path.join(userData, 'workspace');
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const cfgWs = readConfigSectionValue(raw, 'workspace', 'path');
      if (cfgWs) workspaceRoot = path.resolve(userData, cfgWs);
    } catch {
      /* 保持默认 */
    }
    fs.mkdirSync(workspaceRoot, { recursive: true });
    const template = path.join(process.resourcesPath, 'workspace-template');
    if (fs.existsSync(template) && fs.readdirSync(workspaceRoot).length === 0) {
      fs.cpSync(template, workspaceRoot, { recursive: true });
    }
  } else {
    workspaceRoot = path.join(rootDir, 'typst');
  }
  const serverMod = await import(pathToFileURL(path.join(rootDir, 'server.js')).href);
  if (isDev) {
    httpServer = await serverMod.start(0);
  } else {
    const app2 = serverMod.createApp();
    serverMod.serveStaticDist(app2);
    await new Promise((resolve, reject) => {
      const s = app2.listen(0, resolve);
      s.on('error', reject);
      httpServer = s;
    });
  }
  const port = httpServer.address().port;
  console.log(`[electron] serving http://127.0.0.1:${port}`);
  createWindow(port);
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`) && !url.startsWith(`http://localhost:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const isSafeWorkspacePath = (p) => {
  const workspace = path.resolve(workspaceRoot || path.join(rootDir, 'typst'));
  const full = path.resolve(String(p || ''));
  return full === workspace || full.startsWith(workspace + path.sep);
};

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
}));

ipcMain.handle('shell:reveal', (_event, filePath) => {
  if (!isSafeWorkspacePath(filePath)) return false;
  shell.showItemInFolder(filePath);
  return true;
});

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();
  try {
    await boot();
  } catch (err) {
    console.error('[electron] boot failed:', err);
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && httpServer) {
      createWindow(httpServer.address().port);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (httpServer) httpServer.close();
});
