import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** «Администрирование платформы» (P2-0013) → js/dist/platform-admin/platform-admin.js (без React и клиента сервера — вызовы через вход платформы).
 *  Скачивается только администратору платформы. */
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    emptyOutDir: true,
    outDir: 'js/dist/platform-admin',
    lib: {
      entry: resolve(root, 'src/platform/admin/index.ts'),
      name: 'Platform2Admin',
      formats: ['es'],
      fileName: () => 'platform-admin.js'
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
