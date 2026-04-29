import { type Command } from 'commander'
import { SpecPath } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `specs outline` command.
 *
 * @param parent - Parent command to attach the subcommand to.
 * @returns Nothing.
 */
export function registerSpecOutline(parent: Command): void {
  parent
    .command('outline <specPath>')
    .allowExcessArguments(false)
    .description('Display the navigable structure (outline) of a spec artifact.')
    .option(
      '--artifact <name>',
      'resolve artifact filename from the active schema (e.g. specs, verify)',
    )
    .option('--file <name>', 'specify a direct filename within the spec directory')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Array<{ filename: string, outline: OutlineEntry[] }>

Examples:
  specd specs outline core:core/config
  specd specs outline core:core/config --artifact verify
  specd specs outline core:core/config --file verify.md --format toon
`,
    )
    .action(
      async (
        specPath: string,
        opts: { artifact?: string; file?: string; format: string; config?: string },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const parsed = parseSpecId(specPath, config)

          if (opts.artifact !== undefined) {
            const schemaResult = await kernel.specs.getActiveSchema.execute()
            if (schemaResult.raw) {
              throw new Error('Unexpected raw schema result')
            }
            const schema = schemaResult.schema
            const artifactType = schema.artifact(opts.artifact)

            if (artifactType === null) {
              cliError(`unknown artifact ID '${opts.artifact}'`, opts.format)
            }

            if (artifactType.scope !== 'spec') {
              cliError(
                `artifact '${opts.artifact}' has scope '${artifactType.scope}' (must be 'spec' to outline)`,
                opts.format,
              )
            }
          }

          const result = await kernel.specs.getOutline.execute({
            workspace: parsed.workspace,
            specPath: SpecPath.parse(parsed.capabilityPath),
            ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
            ...(opts.file !== undefined ? { filename: opts.file } : {}),
          })

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(JSON.stringify(result, null, 2), 'text')
          } else {
            output(result, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
