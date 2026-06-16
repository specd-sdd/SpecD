import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/preload/bridge.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist/preload',
  clean: false,
  bundle: false,
  dts: false,
  sourcemap: false,
  splitting: false,
})
