import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec schema` command group.
 *
 * @param parent - Parent commander command
 */
export function registerSpecSchema(parent: Command): void {
  const command = parent
    .command('schema')
    .description('Inspect and reassign the persisted schema identity for a spec.')

  command
    .command('get <specPath>')
    .allowExcessArguments(false)
    .description('Show the persisted schema identity for a spec.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.getPersistedSchema.execute({ specId })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`schema: ${result.schema.name}@${result.schema.version}`, 'text')
        } else {
          output({ result: 'ok', specId, schema: result.schema }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('set <specPath>')
    .allowExcessArguments(false)
    .description('Reassign the persisted schema identity for an initialized spec.')
    .requiredOption('--schema <schema-ref>', 'target schema reference')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { schema: string; format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.updatePersistedSchema.execute({
          specId,
          schemaRef: opts.schema,
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(
            `schema: ${result.schema.name}@${result.schema.version} (changed: ${result.changed})`,
            'text',
          )
          output(`dependsOn: ${result.dependsOn.join(', ') || '(empty)'}`, 'text')
        } else {
          output({ result: 'ok', ...result }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
