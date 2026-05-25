import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['test/**/*.spec.ts'],
          exclude: ['test/static-ui.spec.ts'],
          setupFiles: ['./test/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'static-ui',
          environment: 'node',
          include: ['test/static-ui.spec.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
})
