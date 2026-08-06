import { session } from './state.js';
import { saveAllFiles } from './editor-core.js';
import { exportSVG, exportPDF, doRender, refreshPdf } from './preview.js';
import { createNewFile } from './file-tree.js';

export function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveAllFiles();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'e') {
      e.preventDefault();
      exportSVG();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'p') {
      e.preventDefault();
      exportPDF();
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'c') {
      e.preventDefault();
      if (session.previewMode === 'canvas') {
        doRender();
      } else {
        refreshPdf();
      }
    }
  });
}
