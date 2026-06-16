import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main/**/*.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist/main',
  clean: true,
  bundle: false,
  dts: false,
  sourcemap: false,
  splitting: false,
})
