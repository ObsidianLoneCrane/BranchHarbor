import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  optimizeDeps: {
    include: [
      'highlight.js/lib/core',
      ...['javascript', 'typescript', 'rust', 'python', 'json', 'css', 'xml', 'bash'].map(
        (language) => `highlight.js/lib/languages/${language}`,
      ),
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/.dev-env/**',
        '**/.dev-data/**',
        '**/src-tauri/**',
        '**/work/**',
        '**/test-results/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: ['es2022', 'chrome105', 'safari15'] },
})
