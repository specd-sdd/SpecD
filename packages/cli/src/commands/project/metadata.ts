import { type Command } from 'commander'
import { ProjectMetadataNotFoundError } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `project metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectMetadata(parent: Command): void {
  parent
    .command('metadata')
    .allowExcessArguments(false)
    .description(
      'Display the full contents of the project-level metadata (LLM optimization and freshness hashes).',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })

        const { metadata } = await kernel.project.getMetadata.execute()

        if (metadata === null) {
          throw new ProjectMetadataNotFoundError()
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(JSON.stringify(metadata, null, 2), 'text')
        } else {
          output(metadata, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
