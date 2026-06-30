import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist/main',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  bundle: true,
  dts: false,
  sourcemap: false,
  splitting: false,
  external: ['electron', '@specd/sdk', '@specd/client', '@specd/code-graph-electron'],
})
