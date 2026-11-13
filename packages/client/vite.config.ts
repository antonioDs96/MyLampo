import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    // `public/assets` holds the models, so the hashed bundles get a folder of their own.
    assetsDir: 'build',
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
  },
});
