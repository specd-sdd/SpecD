import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration for the public-web workspace.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
