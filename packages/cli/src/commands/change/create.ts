import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { collect } from '../../helpers/collect.js'

/**
 * Registers the `change create` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeCreate(parent: Command): void {
  parent
    .command('create <name>')
    .allowExcessArguments(false)
    .description('Create a new change to track a unit of work through the specd lifecycle.')
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
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          const parsedSpecs = opts.spec.map((s) => parseSpecId(s, config))

          const readOnlyErrors: string[] = []
          for (const parsed of parsedSpecs) {
            const ws = config.workspaces.find((w) => w.name === parsed.workspace)
            if (ws && ws.ownership === 'readOnly') {
              readOnlyErrors.push(
                `Cannot add spec "${parsed.specId}" to change — workspace "${parsed.workspace}" is readOnly.\n\nReadOnly workspaces are protected: their specs and code cannot be modified by changes.`,
              )
            }
          }
          if (readOnlyErrors.length > 0) {
            for (const msg of readOnlyErrors) {
              process.stderr.write(`error: ${msg}\n`)
            }
            process.exit(1)
          }

          const specIds = parsedSpecs.map((p) => p.specId)

          const schema = await kernel.specs.getActiveSchema.execute()

          const { change, changePath } = await kernel.changes.create.execute({
            name,
            ...(opts.description !== undefined ? { description: opts.description } : {}),
            specIds,
            schemaName: schema.name(),
            schemaVersion: schema.version(),
          })

          // Check for spec overlap and warn
          if (specIds.length > 0) {
            try {
              const overlapReport = await kernel.changes.detectOverlap.execute({ name })
              if (overlapReport.hasOverlap) {
                const specList = overlapReport.entries
                  .map(
                    (e) =>
                      `  ${e.specId} — also targeted by: ${e.changes
                        .filter((c) => c.name !== name)
                        .map((c) => `${c.name} (${c.state})`)
                        .join(', ')}`,
                  )
                  .join('\n')
                process.stderr.write(`warning: spec overlap detected:\n${specList}\n`)
              }
            } catch {
              // Overlap detection is best-effort — don't fail create
            }
          }

          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`created change ${name}`, 'text')
          } else {
            output({ result: 'ok', name, state: change.state, changePath }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
