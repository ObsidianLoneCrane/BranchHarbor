import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
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
