import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// relative base so the build works from a subpath like github.io/candy-wall/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), blockblast: resolve(import.meta.dirname, 'blockblast.html') },
    },
  },
});
