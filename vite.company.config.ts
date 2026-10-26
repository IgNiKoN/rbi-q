import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/** Бандл раздела «Компания» (React) → js/dist/company/company.js (ES module, React внутри бандла). */
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    emptyOutDir: true,
    outDir: 'js/dist/company',
    lib: {
      entry: resolve(root, 'src/platform/company/index.ts'),
      name: 'Platform2Company',
      formats: ['es'],
      fileName: () => 'company.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    minify: true,
    sourcemap: true
  }
});
