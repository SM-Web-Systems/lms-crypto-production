import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const extraAllowedHosts =
  process.env.VITE_DEV_ALLOWED_HOSTS?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? []

const allowedHosts = [
  'localhost',
  '.localhost',
  '127.0.0.1',
  'lms.smwebsystems.com',
  ...extraAllowedHosts,
]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    strictPort: false,
    allowedHosts,
  },
  preview: {
    host: true,
    strictPort: false,
    port: 5173,
    allowedHosts,
  },
})
