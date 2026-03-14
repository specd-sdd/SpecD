import { Command } from 'commander'
import { createCodeGraphProvider } from '@specd/code-graph'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'

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
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(async (opts: { path: string; format: string }) => {
      try {
        const fmt = parseFormat(opts.format)
        const provider = createCodeGraphProvider({ storagePath: opts.path })

        await provider.open()
        try {
          const result = await provider.index({ workspacePath: opts.path })

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
        } finally {
          await provider.close()
        }
        process.exit(0)
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
