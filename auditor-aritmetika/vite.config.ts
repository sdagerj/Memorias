import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * SINGLE_FILE=1 compila para el HTML autocontenido que se abre con doble click.
 *
 * En ese modo el bundle sale como IIFE y no como modulo ES: al abrir un archivo
 * desde el disco (file://) los navegadores aplican reglas de origen mucho mas
 * estrictas a los modulos, y un script clasico las esquiva por completo.
 */
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la app se puede servir desde un subdirectorio o abrir
  // desde el sistema de archivos sin reconfigurar nada.
  base: './',
  resolve: {
    alias: { '@': path.resolve(rootDir, './src') },
  },
  build: {
    outDir: singleFile ? 'dist-single' : 'dist',
    rollupOptions: singleFile
      ? { output: { format: 'iife', inlineDynamicImports: true } }
      : undefined,
  },
});
