import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// relative base so the build works from a subpath like github.io/candy-wall/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html'), wall: resolve(import.meta.dirname, 'wall.html'), candygrid: resolve(import.meta.dirname, 'candygrid.html'), candydrop: resolve(import.meta.dirname, 'candydrop.html'), candypop: resolve(import.meta.dirname, 'candypop.html') },
    },
  },
});
