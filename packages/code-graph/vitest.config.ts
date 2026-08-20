import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // SQLite tests are native, memory-intensive, and filesystem-intensive.
    maxWorkers: 1,
  },
})
