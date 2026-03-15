import { Command } from 'commander'
import { type IndexOptions } from '@specd/code-graph'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { output, parseFormat } from '../../formatter.js'
import { withProvider } from './with-provider.js'

/**
 * Registers the `graph index` command.
 * @param parent - The parent commander command.
 */
export function registerGraphIndex(parent: Command): void {
  parent
    .command('index')
    .allowExcessArguments(false)
    .description('Index the workspace into the code graph')
    .option('--path <path>', 'workspace root path', process.cwd())
    .option('--force', 'full re-index, ignoring cached hashes')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(async (opts: { path: string; force?: boolean; format: string }) => {
      const fmt = parseFormat(opts.format)
      const isTTY = process.stderr.isTTY === true && fmt === 'text'

      // --force: delete DB files before opening to clear stale locks and WAL
      if (opts.force) {
        const specdDir = join(opts.path, '.specd')
        for (const name of ['code-graph.lbug', 'code-graph.lbug.wal', 'code-graph.lbug.lock']) {
          const p = join(specdDir, name)
          if (existsSync(p)) rmSync(p, { force: true })
        }
      }

      await withProvider(opts.path, opts.format, async (provider) => {
        const progressFn = (percent: number, phase: string): void => {
          process.stderr.write(`\r\x1b[K  ${String(percent).padStart(3)}% ${phase}`)
        }

        const indexOpts: IndexOptions = isTTY
          ? { workspacePath: opts.path, onProgress: progressFn }
          : { workspacePath: opts.path }

        const result = await provider.index(indexOpts)

        if (isTTY) {
          process.stderr.write('\r\x1b[K')
        }

        if (fmt === 'text') {
          const lines = [
            `Indexed ${String(result.filesIndexed)} file(s) in ${String(result.duration)}ms`,
            `  discovered: ${String(result.filesDiscovered)}`,
            `  skipped:    ${String(result.filesSkipped)}`,
            `  removed:    ${String(result.filesRemoved)}`,
            `  specs:      ${String(result.specsIndexed)}`,
          ]
          if (result.errors.length > 0) {
            lines.push(`  errors:     ${String(result.errors.length)}`)
            for (const err of result.errors) {
              lines.push(`    ${err.filePath}: ${err.message}`)
            }
          }
          output(lines.join('\n'), 'text')
        } else {
          output(result, fmt)
        }
      })
    })
}
