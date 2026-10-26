import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Вход платформы (P2-0013) → js/dist/platform/platform.js (ES module, без React): экран «Вход», кто вошёл и мои модули.
 *  Скачивается всем при открытии; модули (planfact, company) — только положенные, после входа. */
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    emptyOutDir: true,
    outDir: 'js/dist/platform',
    lib: {
      entry: resolve(root, 'src/platform/auth/entry.ts'),
      name: 'Platform2Entry',
      formats: ['es'],
      fileName: () => 'platform.js'
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
