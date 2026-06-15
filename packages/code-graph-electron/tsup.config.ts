import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const sharedSqliteStorePath = path.resolve(
  configDir,
  '../code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts',
)
const vendoredRuntimeImportPath =
  '../../../../code-graph-electron/src/runtime/vendored-better-sqlite3.ts'

const electronSqliteVendorPlugin = {
  name: 'electron-sqlite-vendor',
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{ contents: string; loader: 'ts' } | null>,
    ): void
  }) {
    build.onLoad({ filter: /sqlite-graph-store\.ts$/ }, async (args) => {
      if (path.resolve(args.path) !== sharedSqliteStorePath) {
        return null
      }

      const source = await fs.readFile(args.path, 'utf8')
      return {
        contents: source.replace(
          "from 'better-sqlite3'",
          `from '${vendoredRuntimeImportPath}'`,
        ),
        loader: 'ts',
      }
    })
  },
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  external: [
    '@ast-grep/lang-go',
    '@ast-grep/lang-php',
    '@ast-grep/lang-python',
    '@ast-grep/napi',
    '@specd/core',
    'ignore',
    'lbug',
  ],
  esbuildPlugins: [electronSqliteVendorPlugin],
})
