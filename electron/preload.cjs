const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('typstDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('app:info'),
  revealInFolder: (filePath) => ipcRenderer.invoke('shell:reveal', filePath),
});
