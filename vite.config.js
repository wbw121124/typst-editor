import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import fs from 'fs';
import path from 'path';

function copyDir(src, dest) {
  return {
    name: `copy-${dest.replace(/[^\w-]/g, '-')}`,
    closeBundle() {
      const from = path.resolve(src);
      const to = path.resolve(dest);
      if (fs.existsSync(to)) {
        fs.rmSync(to, { recursive: true, force: true });
      }
      if (fs.existsSync(from)) {
        fs.cpSync(from, to, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    wasm(),
    copyDir('pdf.js-element', 'dist/pdf.js-element'),
    copyDir('packages', 'dist/packages'),
  ],
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
