import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл service.locations → js/dist/rbi-locations.js (ES module). */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'js/dist',
    lib: {
      entry: resolve(root, 'src/services/locations/index.ts'),
      name: 'RBILocations',
      formats: ['es'],
      fileName: () => 'rbi-locations.js'
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
