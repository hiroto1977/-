import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const electronOutDir = path.resolve(projectRoot, 'dist-electron');

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
            sourcemap: true,
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
            sourcemap: 'inline',
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
