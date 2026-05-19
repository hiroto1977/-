import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const electronOutDir = path.resolve(projectRoot, 'dist-electron');

// Sourcemaps embed full TypeScript source. Useful in dev (stack traces
// point at .ts lines), but in a packaged build they ship the entire
// privileged main-process source to every end user — which lowers the
// bar for finding bugs in token storage, OAuth, IPC handlers. Gate on
// production mode.
const isDev = process.env.NODE_ENV !== 'production' && process.env.VITE_DEV !== '0';

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    react(),
    electron([
      {
        entry: path.resolve(projectRoot, 'src/main/main.ts'),
        vite: {
          build: {
            outDir: electronOutDir,
            sourcemap: isDev,
            emptyOutDir: false,
          },
        },
      },
      {
        entry: path.resolve(projectRoot, 'src/preload/preload.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: electronOutDir,
            sourcemap: isDev ? 'inline' : false,
            emptyOutDir: false,
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
