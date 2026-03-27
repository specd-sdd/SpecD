import chalk from 'chalk'
import { createTwoFilesPatch } from 'diff'
import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'

/**
 * Registers the `change spec-preview` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeSpecPreview(parent: Command): void {
  parent
    .command('spec-preview <name> <specId>')
    .allowExcessArguments(false)
    .description(
      'Preview a spec after applying deltas from a change — shows merged content or a colorized diff.',
    )
    .option('--diff', 'show unified diff instead of merged content')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        specId: string,
        opts: { format: string; config?: string; diff?: boolean },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const result = await kernel.changes.preview.execute({ name, specId })

          // Warnings to stderr
          for (const warning of result.warnings) {
            console.error(`warning: ${warning}`)
          }

          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.files.length === 0) {
              output('No preview files — all deltas are no-op or missing.', 'text')
              return
            }

            if (opts.diff === true) {
              for (const file of result.files) {
                const diffStr = createTwoFilesPatch(
                  `a/${file.filename} (base)`,
                  `b/${file.filename} (merged)`,
                  file.base ?? '',
                  file.merged,
                  undefined,
                  undefined,
                  { context: 3 },
                )
                output(`--- ${file.filename} ---`, 'text')
                const lines = diffStr.split('\n')
                for (const line of lines) {
                  if (line.startsWith('+')) {
                    output(chalk.green(line), 'text')
                  } else if (line.startsWith('-')) {
                    output(chalk.red(line), 'text')
                  } else if (line.startsWith('@@')) {
                    output(chalk.cyan(line), 'text')
                  } else {
                    output(chalk.dim(line), 'text')
                  }
                }
              }
            } else {
              for (const file of result.files) {
                output(`--- ${file.filename} ---`, 'text')
                output(file.merged, 'text')
              }
            }
          } else {
            if (opts.diff === true) {
              // JSON/TOON: include non-colorized diff strings
              const filesWithDiff = result.files.map((file) => ({
                ...file,
                diff: createTwoFilesPatch(
                  `a/${file.filename} (base)`,
                  `b/${file.filename} (merged)`,
                  file.base ?? '',
                  file.merged,
                  undefined,
                  undefined,
                  { context: 3 },
                ),
              }))
              output({ ...result, files: filesWithDiff }, fmt)
            } else {
              output(result, fmt)
            }
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
