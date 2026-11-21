import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/Tint3d/',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Splat Island free-fly preview: /Tint3d/map.html
        splatIsland: fileURLToPath(new URL('./map.html', import.meta.url)),
        // INKFORGE deployment experience preview: /Tint3d/deploy.html
        inkforgeDeploy: fileURLToPath(new URL('./deploy.html', import.meta.url))
      }
    }
  }
});
