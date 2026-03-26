import { type Command } from 'commander'
import { resolve } from 'node:path'
import { type ValidateSchemaResult } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Registers the `schema validate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSchemaValidate(parent: Command): void {
  parent
    .command('validate')
    .allowExcessArguments(false)
    .description(
      'Validate a schema file against the specd schema format, reporting any structural or constraint violations.',
    )
    .option('--file <path>', 'validate an external schema file')
    .option('--raw', 'validate the base schema without plugins or overrides')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { file?: string; raw?: boolean; format: string; config?: string }) => {
      const fmt = parseFormat(opts.format)

      if (opts.file !== undefined && opts.raw === true) {
        cliError('--file and --raw are mutually exclusive', opts.format)
      }

      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })

        const input =
          opts.file !== undefined
            ? { mode: 'file' as const, filePath: resolve(opts.file) }
            : opts.raw === true
              ? { mode: 'project-raw' as const }
              : { mode: 'project' as const }

        const result = await kernel.specs.validateSchema.execute(input)
        const modeLabel = input.mode === 'project-raw' ? 'project-raw' : input.mode

        formatResult(result, modeLabel, fmt)
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}

/**
 * Formats and outputs a validation result, exiting with code 1 on failure.
 *
 * @param result - The validation result from the use case
 * @param mode - The mode label for output
 * @param fmt - The output format
 */
function formatResult(
  result: ValidateSchemaResult,
  mode: string,
  fmt: ReturnType<typeof parseFormat>,
): void {
  if (result.valid) {
    const schema = result.schema
    const suffix = mode === 'project-raw' ? ' [raw]' : mode === 'file' ? ' [file]' : ''
    if (fmt === 'text') {
      let text = `schema valid: ${schema.name()} v${schema.version()} (${schema.artifacts().length} artifacts, ${schema.workflow().length} workflow steps)${suffix}`
      for (const w of result.warnings) {
        text += `\n  warning: ${w}`
      }
      output(text, 'text')
    } else {
      output(
        {
          result: 'ok',
          schema: { name: schema.name(), version: schema.version() },
          artifacts: schema.artifacts().length,
          workflowSteps: schema.workflow().length,
          mode,
          warnings: [...result.warnings],
        },
        fmt,
      )
    }
  } else {
    if (fmt === 'text') {
      const lines = result.errors.map((e) => `  ${e}`)
      output(`schema validation failed:\n${lines.join('\n')}`, 'text')
    } else {
      output(
        {
          result: 'error',
          errors: result.errors.map((message) => ({ message })),
          warnings: [...result.warnings],
          mode,
        },
        fmt,
      )
    }
    process.exit(1)
  }
}
