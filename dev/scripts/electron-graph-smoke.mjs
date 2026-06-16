import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const { createConfigLoader } = await import(pathToFileURL(path.join(repoRoot, 'packages/core/dist/index.js')).href)
const { createCodeGraphProvider, vendoredSqliteBinaryPath } = await import(
  pathToFileURL(path.join(repoRoot, 'packages/code-graph-electron/dist/index.js')).href
)

const loader = createConfigLoader({ startDir: repoRoot })
const config = await loader.load()
const provider = createCodeGraphProvider(config)

await provider.open()

try {
  const stats = await provider.getStatistics()
  const symbols = await provider.searchSymbols({
    query: 'createCodeGraphProvider',
    limit: 3,
  })
  process.stdout.write(
    `${JSON.stringify({
      fileCount: stats.fileCount,
      symbolCount: stats.symbolCount,
      specCount: stats.specCount,
      vendoredSqliteBinaryPath,
      firstSymbol: symbols[0]?.symbol.name ?? null,
      resultCount: symbols.length,
    })}\n`,
  )
} finally {
  await provider.close()
}
