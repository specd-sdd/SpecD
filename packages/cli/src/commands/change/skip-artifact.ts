import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change skip-artifact` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeSkipArtifact(parent: Command): void {
  parent
    .command('skip-artifact <name> <artifactId>')
    .allowExcessArguments(false)
    .description(
      'Mark an optional artifact as skipped for a change, so it is not required to satisfy the current lifecycle step.',
    )
    .option('--reason <text>', 'reason for skipping')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", name: string, artifactId: string }
`,
    )
    .action(
      async (
        name: string,
        artifactId: string,
        opts: { reason?: string; format: string; config?: string },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          await kernel.changes.skipArtifact.execute({
            name,
            artifactId,
            ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
          })
          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`skipped artifact ${artifactId} on ${name}`, 'text')
          } else {
            output({ result: 'ok', name, artifactId }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
