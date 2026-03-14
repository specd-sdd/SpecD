import { Command } from 'commander'
import { createCodeGraphProvider } from '@specd/code-graph'
import { handleError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'

/**
 * Registers the `graph impact` command.
 * @param parent - The parent commander command.
 */
export function registerGraphImpact(parent: Command): void {
  parent
    .command('impact <file>')
    .allowExcessArguments(false)
    .description('Analyze impact of changes to a file')
    .option('--direction <dir>', 'traversal direction: upstream|downstream|both', 'upstream')
    .option('--path <path>', 'workspace root path', process.cwd())
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (
        file: string,
        opts: {
          direction: string
          path: string
          format: string
        },
      ) => {
        try {
          const fmt = parseFormat(opts.format)
          const direction = opts.direction as 'upstream' | 'downstream' | 'both'
          const provider = createCodeGraphProvider({ storagePath: opts.path })

          await provider.open()
          try {
            const result = await provider.analyzeFileImpact(file, direction)

            if (fmt === 'text') {
              const lines = [
                `Impact analysis for ${file}`,
                `  Risk level:       ${result.riskLevel}`,
                `  Direct deps:      ${String(result.directDependents)}`,
                `  Indirect deps:    ${String(result.indirectDependents)}`,
                `  Transitive deps:  ${String(result.transitiveDependents)}`,
                `  Affected files:   ${String(result.affectedFiles.length)}`,
              ]

              if (result.affectedFiles.length > 0) {
                lines.push('')
                lines.push('Affected files:')
                for (const f of result.affectedFiles) {
                  lines.push(`  ${f}`)
                }
              }

              if (result.symbols.length > 0) {
                lines.push('')
                lines.push('Per-symbol breakdown:')
                for (const s of result.symbols) {
                  lines.push(
                    `  ${s.target}  risk=${s.riskLevel} direct=${String(s.directDependents)}`,
                  )
                }
              }

              output(lines.join('\n'), 'text')
            } else {
              output(result, fmt)
            }
          } finally {
            await provider.close()
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
