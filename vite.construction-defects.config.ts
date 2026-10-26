import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл service.constructionDefects → js/dist/rbi-construction-defects.js (ES module). */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'js/dist',
    lib: {
      entry: resolve(root, 'src/services/construction-defects/index.ts'),
      name: 'RBIConstructionDefects',
      formats: ['es'],
      fileName: () => 'rbi-construction-defects.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    minify: false,
    sourcemap: true
  }
});
