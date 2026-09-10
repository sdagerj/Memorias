import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// `base` se ajusta al publicar en GitHub Pages bajo un subdirectorio.
// Para un repositorio propio servido en la raíz, dejar '/'.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['iconos/icono.svg', 'iconos/icono-mascara.svg'],
      manifest: {
        name: 'Enfoque — entrenamiento cognitivo',
        short_name: 'Enfoque',
        description:
          'Práctica personal de memoria de trabajo, fluidez verbal y control atencional. Los datos se quedan en el dispositivo.',
        lang: 'es-CO',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf8f5',
        theme_color: '#faf8f5',
        icons: [
          { src: 'iconos/icono.svg', sizes: 'any', type: 'image/svg+xml' },
          {
            src: 'iconos/icono-mascara.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
