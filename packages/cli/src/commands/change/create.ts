import { type Command } from 'commander'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { buildWorkspaceSchemasPaths } from '../../helpers/workspace-map.js'

/**
 * Accumulates repeated option values into an array.
 *
 * @param value - The current option value.
 * @param previous - The accumulated array so far.
 * @returns A new array with the value appended.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/**
 * Registers the `change create` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeCreate(parent: Command): void {
  parent
    .command('create <name>')
    .description('Create a new change')
    .option('--spec <id>', 'spec path (repeatable)', collect, [] as string[])
    .option('--description <text>', 'change description (informational)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        opts: { spec: string[]; description?: string; format: string; config?: string },
      ) => {
        try {
          if (opts.spec.length === 0) {
            process.stderr.write('error: required option --spec not provided\n')
            process.exit(1)
          }

          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
            process.stderr.write(`error: invalid change name '${name}' — must be kebab-case\n`)
            process.exit(1)
          }

          const config = await loadConfig({ configPath: opts.config })
          const kernel = createCliKernel(config)

          const specIds = opts.spec.map((s) => parseSpecId(s, config).specId)

          // Derive workspaces from specIds
          const workspaceNames = config.workspaces.map((w) => w.name)
          const workspaceSet = new Set<string>()
          for (const specId of specIds) {
            const slash = specId.indexOf('/')
            const prefix = slash !== -1 ? specId.slice(0, slash) : null
            if (prefix !== null && workspaceNames.includes(prefix)) {
              workspaceSet.add(prefix)
            } else {
              workspaceSet.add('default')
            }
          }
          const workspaces = [...workspaceSet]

          const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
          const schema = await kernel.specs.getActiveSchema.execute({
            schemaRef: config.schemaRef,
            workspaceSchemasPaths,
          })

          const change = await kernel.changes.create.execute({
            name,
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            workspaces,
            specIds,
            schemaName: schema.name(),
            schemaVersion: schema.version(),
          })

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`created change ${name}`, 'text')
          } else {
            output({ result: 'ok', name, state: change.state }, fmt)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
