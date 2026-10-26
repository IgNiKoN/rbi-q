import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл модуля planfact (React) → js/dist/planfact/planfact.js (ES module, React внутри бандла).
 *  Библиотека Excel (экран «ВОР», P2-0006) — отдельный файл js/dist/planfact/chunks/*, грузится только при выборе файла. */
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    emptyOutDir: true,
    outDir: 'js/dist/planfact',
    lib: {
      entry: resolve(root, 'src/modules/planfact/index.ts'),
      name: 'Platform2Planfact',
      formats: ['es'],
      fileName: () => 'planfact.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: false,
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    },
    minify: true,
    sourcemap: true
  }
});
