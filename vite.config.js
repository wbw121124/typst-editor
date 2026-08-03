import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
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
