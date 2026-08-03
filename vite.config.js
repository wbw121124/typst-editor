import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@myriaddreamin/typst-ts-renderer', '@myriaddreamin/typst-ts-web-compiler'],
  },
  build: {
    target: 'esnext',
  },
});
