import { type Command } from 'commander'
import { SpecPath } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec invalidate-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecInvalidateMetadata(parent: Command): void {
  parent
    .command('invalidate-metadata <specPath>')
    .allowExcessArguments(false)
    .description(
      'Mark spec metadata as stale by clearing its content hashes, forcing regeneration on the next metadata read.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const parsed = parseSpecId(specPath, config)

        const result = await kernel.specs.invalidateMetadata.execute({
          workspace: parsed.workspace,
          specPath: SpecPath.parse(parsed.capabilityPath),
        })

        if (result === null) {
          cliError(`spec '${specPath}' not found or has no metadata`, opts.format)
        }

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`invalidated metadata for ${result.spec}`, 'text')
        } else {
          output({ result: 'ok', spec: result.spec }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
