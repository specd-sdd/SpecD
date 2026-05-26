import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SPECD_API_BASE_URL': JSON.stringify(process.env.SPECD_API_BASE_URL ?? ''),
  },
  resolve: {
    alias: {
      '@specd/ui/styles.css': path.resolve(dirname, '../../packages/ui/dist/styles.css'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
