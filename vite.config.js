import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import fs from 'fs';
import path from 'path';

function copyPdfJsElement() {
  return {
    name: 'copy-pdfjs-element',
    closeBundle() {
      const src = path.resolve('pdf.js-element');
      const dest = path.resolve('dist/pdf.js-element');
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [wasm(), copyPdfJsElement()],
  optimizeDeps: {
    exclude: [
      '@myriaddreamin/typst-ts-renderer',
      '@myriaddreamin/typst-ts-web-compiler',
      '@vedivad/typst-web-service',
    ],
  },
  build: {
    target: 'esnext',
  },
});
