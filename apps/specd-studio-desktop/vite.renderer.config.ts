import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@specd/ui/styles.css': path.resolve(dirname, '../../packages/ui/dist/styles.css'),
    },
  },
  base: './',
  build: {
    outDir: path.join(dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
  },
})
