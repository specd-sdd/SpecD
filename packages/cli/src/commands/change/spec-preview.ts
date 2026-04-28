/* eslint-disable jsdoc/require-jsdoc */
import * as path from 'node:path'
import chalk from 'chalk'
import { createTwoFilesPatch } from 'diff'
import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'

interface PreviewFile {
  readonly filename: string
  readonly merged: string
  readonly base: string
}

function isPreviewFile(value: unknown): value is Omit<PreviewFile, 'base'> & {
  base?: string | null
} {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['filename'] === 'string' &&
    typeof candidate['merged'] === 'string' &&
    (candidate['base'] === undefined ||
      candidate['base'] === null ||
      typeof candidate['base'] === 'string')
  )
}

function asPreviewFiles(files: readonly unknown[]): PreviewFile[] {
  return files.flatMap((value) => {
    if (!isPreviewFile(value)) return []
    return [
      {
        filename: value.filename,
        merged: value.merged,
        base: typeof value.base === 'string' ? value.base : '',
      },
    ]
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
          let result = await kernel.changes.preview.execute({ name, specId })

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

            if (opts.diff === true) {
              for (const file of asPreviewFiles(result.files)) {
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
              for (const file of asPreviewFiles(result.files)) {
                output(`--- ${file.filename} ---`, 'text')
                output(file.merged, 'text')
              }
            }
          } else {
            if (opts.diff === true) {
              // JSON/TOON: include non-colorized diff strings
              const filesWithDiff = asPreviewFiles(result.files).map((file) => ({
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
