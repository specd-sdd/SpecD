import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    environmentMatchGlobs: [
      ['test/**/*.spec.tsx', 'jsdom'],
      ['test/use-workspace-specs-collection.spec.ts', 'jsdom'],
    ],
  },
})
