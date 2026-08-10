import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app se puede servir desde un subdirectorio o abrir
  // desde el sistema de archivos sin reconfigurar nada.
  base: './',
  resolve: {
    alias: { '@': path.resolve(rootDir, './src') },
  },
});
