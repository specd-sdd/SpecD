import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@specd/client',
    'react-resizable-panels',
    '@monaco-editor/react',
    'monaco-editor',
    'lucide-react',
    '@radix-ui/react-slot',
    'class-variance-authority',
    'clsx',
    'tailwind-merge',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
