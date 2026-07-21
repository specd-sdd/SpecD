/* eslint-disable jsdoc/require-jsdoc */
import * as path from 'node:path'
import chalk from 'chalk'
import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'

interface PreviewFile {
  readonly filename: string
  readonly merged: string
  readonly base: string | null
  readonly diff?: string
  readonly status: 'merged' | 'no-op' | 'missing'
}

function isPreviewFile(value: unknown): value is PreviewFile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['filename'] === 'string' &&
    typeof candidate['merged'] === 'string' &&
    (candidate['base'] === null || typeof candidate['base'] === 'string') &&
    (candidate['diff'] === undefined || typeof candidate['diff'] === 'string') &&
    (candidate['status'] === 'merged' ||
      candidate['status'] === 'no-op' ||
      candidate['status'] === 'missing')
  )
}

function asPreviewFiles(files: readonly unknown[]): PreviewFile[] {
  return files.flatMap((value) => {
    if (!isPreviewFile(value)) return []
    return [value]
  })
}

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
    .option('--artifact <name>', 'filter by artifact ID (e.g. specs, verify)')
    .option('--diff', 'show unified diff instead of merged content')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        specId: string,
        opts: { artifact?: string; format: string; config?: string; diff?: boolean },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          let result = await kernel.changes.preview.execute({
            name,
            specId,
            ...(opts.diff === true ? { includeDiff: true } : {}),
          })

          // Warnings to stderr
          for (const warning of result.warnings) {
            console.error(`warning: ${warning}`)
          }

          if (opts.artifact !== undefined) {
            const schemaResult = await kernel.specs.getActiveSchema.execute()
            if (schemaResult.raw) {
              throw new Error('Unexpected raw schema result')
            }
            const schema = schemaResult.schema
            const artifactType = schema.artifact(opts.artifact)

            if (artifactType === null) {
              cliError(`unknown artifact ID '${opts.artifact}' in schema`, opts.format)
            }

            if (artifactType.scope !== 'spec') {
              cliError(
                `artifact '${opts.artifact}' has scope '${artifactType.scope}' (must be 'spec' to show)`,
                opts.format,
              )
            }

            const targetFilename = path.basename(artifactType.output)
            const filteredFiles = asPreviewFiles(result.files).filter(
              (file) => file.filename === targetFilename,
            )

            if (filteredFiles.length === 0) {
              cliError(
                `artifact '${opts.artifact}' (${targetFilename}) not found in change for spec '${specId}'`,
                opts.format,
              )
            }

            result = {
              ...result,
              files: filteredFiles,
            }
          }

          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            if (result.files.length === 0) {
              output('No preview files — all deltas are no-op or missing.', 'text')
              return
            }

            const getLabel = (file: PreviewFile): string => {
              if (file.status === 'merged') return ''
              if (file.status === 'no-op') return ' (no-op delta, showing original)'
              if (file.status === 'missing') {
                return file.base !== null
                  ? ' (missing artifact, showing original)'
                  : ' (missing artifact)'
              }
              return ''
            }

            const sortedFiles = asPreviewFiles(result.files).sort((a, b) => {
              if (a.filename === 'spec.md') return -1
              if (b.filename === 'spec.md') return 1
              return a.filename.localeCompare(b.filename)
            })

            if (opts.diff === true) {
              for (const file of sortedFiles) {
                if (file.diff === undefined) {
                  continue
                }
                output(`--- ${file.filename} ---`, 'text')
                const lines = file.diff.split('\n')
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
              for (const file of sortedFiles) {
                output(`--- ${file.filename} ---${getLabel(file)}`, 'text')
                output(file.merged, 'text')
              }
            }
          } else {
            output(result, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
