export const session = {
  editor: null,
  currentFile: null,
  fileCache: {},
  fileModels: new Map(),
  openTabs: [],
  dirtyFiles: new Set(),
  previewMode: 'pdf',
  zoomLevel: 100,
  typstReady: false,
  entryFile: null,
};
