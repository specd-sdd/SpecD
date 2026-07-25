import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec generate-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecGenerateMetadata(parent: Command): void {
  parent
    .command('generate-metadata [specPath]')
    .allowExcessArguments(false)
    .description('Force-regenerate metadata cache for one spec or all specs in the project.')
    .option('--all', 'regenerate metadata for all specs')
    .option('--force', 'skip dependsOn conflict detection when persisting regenerated metadata')
    .option('--workspace <name>', 'restrict --all to named workspaces (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Single spec: { result: "ok", spec: string, regenerated: true }
  Batch:       { result: "ok"|"partial"|"error", total, succeeded, failed, specs: [...] }
`,
    )
    .action(
      async (
        specPath: string | undefined,
        opts: {
          all?: boolean
          force?: boolean
          workspace: string[]
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
          const force = opts.force === true

          const target =
            opts.all === true
              ? {
                  kind: 'batch' as const,
                  ...(opts.workspace.length > 0 ? { workspaces: opts.workspace } : {}),
                }
              : {
                  kind: 'spec' as const,
                  specId: parseSpecId(specPath!, config).specId,
                }

          const result = await kernel.specs.regenerateMetadata.execute({ target, force })

          if (result.kind === 'spec') {
            const entry = result.result
            if (!entry.ok) {
              cliError(
                entry.error ?? `failed to regenerate metadata for ${entry.specId}`,
                opts.format,
              )
            }
            if (fmt === 'text') {
              output(`regenerated metadata for ${entry.specId}`, 'text')
            } else {
              output(
                {
                  result: 'ok',
                  spec: entry.specId,
                  regenerated: true,
                },
                fmt,
              )
            }
            return
          }

          const total = result.specs.length
          const succeeded = result.specs.filter((entry) => entry.ok).length
          const failed = total - succeeded

          if (fmt === 'text') {
            for (const entry of result.specs) {
              if (entry.ok) {
                output(`regenerated metadata for ${entry.specId}`, 'text')
              } else {
                output(`error: ${entry.specId}: ${entry.error}`, 'text')
              }
            }
            output(`regenerated metadata for ${succeeded}/${total} specs`, 'text')
          } else {
            output(
              {
                result: failed === 0 ? 'ok' : failed === total ? 'error' : 'partial',
                total,
                succeeded,
                failed,
                specs: result.specs.map((entry) =>
                  entry.ok
                    ? { spec: entry.specId, status: 'ok' as const }
                    : {
                        spec: entry.specId,
                        status: 'error' as const,
                        error: entry.error ?? 'unknown error',
                      },
                ),
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
