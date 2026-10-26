import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл module construction-v2 → js/dist/construction-v2.js (ES module). */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'js/dist',
    lib: {
      entry: resolve(root, 'src/modules/construction-v2/index.ts'),
      name: 'RBIConstructionV2',
      formats: ['es'],
      fileName: () => 'construction-v2.js'
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
