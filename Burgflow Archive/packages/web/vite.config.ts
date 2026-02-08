import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600_000,
      },
      '/avatars': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600_000,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600_000,
      },
      '/outputs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 600_000,
      },
    },
  },
})
