import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  external: ['@specd/code-graph'],
})
