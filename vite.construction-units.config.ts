import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл service.constructionUnits → js/dist/rbi-construction-units.js (ES module). */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'js/dist',
    lib: {
      entry: resolve(root, 'src/services/construction-units/index.ts'),
      name: 'RBIConstructionUnits',
      formats: ['es'],
      fileName: () => 'rbi-construction-units.js'
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
