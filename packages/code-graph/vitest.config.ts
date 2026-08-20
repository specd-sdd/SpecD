import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Native LadybugDB/SQLite tests are memory- and filesystem-intensive.
    maxWorkers: 1,
  },
})
