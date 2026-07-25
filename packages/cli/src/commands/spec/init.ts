import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec init` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecInit(parent: Command): void {
  parent
    .command('init [specPath]')
    .allowExcessArguments(false)
    .description(
      'Initialize persisted semantic state for one spec or all lock-less specs in the project.',
    )
    .option('--all', 'initialize all specs without persisted state')
    .option('--workspace <name>', 'restrict --all to named workspaces (repeatable)', collect, [])
    .option('--schema <schema-ref>', 'schema reference to record (default: project schema)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string | undefined,
        opts: {
          all?: boolean
          workspace: string[]
          schema?: string
          format: string
          config?: string
        },
      ) => {
        try {
          if (opts.all === true && specPath !== undefined) {
            cliError('--all and <specPath> are mutually exclusive', opts.format)
          }
          if (opts.all !== true && specPath === undefined) {
            cliError('either <specPath> or --all is required', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const fmt = parseFormat(opts.format)

          const target =
            opts.all === true
              ? {
                  kind: 'all' as const,
                  ...(opts.workspace.length > 0 ? { workspaces: opts.workspace } : {}),
                }
              : {
                  kind: 'spec' as const,
                  specId: parseSpecId(specPath!, config).specId,
                }

          const result = await kernel.specs.initializePersistedState.execute({
            target,
            ...(opts.schema !== undefined ? { schemaRef: opts.schema } : {}),
          })

          if (result.kind === 'spec') {
            const { initialized } = result
            if (fmt === 'text') {
              output(
                `initialized ${initialized.specId} (schema ${initialized.schema.name}@${initialized.schema.version}, dependsOn: ${initialized.dependsOn.join(', ') || 'none'})`,
                'text',
              )
            } else {
              output({ result: 'ok', initialized }, fmt)
            }
            return
          }

          const failed = result.failed.length
          if (fmt === 'text') {
            for (const entry of result.initialized) {
              output(`initialized ${entry.specId}`, 'text')
            }
            for (const entry of result.failed) {
              output(`error: ${entry.specId}: ${entry.error}`, 'text')
            }
            output(
              `batch complete: ${result.initialized.length} initialized, ${failed} failed, ${result.existingSkipped} skipped (already initialized)`,
              'text',
            )
          } else {
            output(
              {
                result: failed > 0 ? 'partial' : 'ok',
                initialized: result.initialized,
                failed: result.failed,
                existingSkipped: result.existingSkipped,
              },
              fmt,
            )
          }

          if (failed > 0) {
            process.exitCode = 1
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
