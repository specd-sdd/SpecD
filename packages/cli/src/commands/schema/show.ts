import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `schema show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSchemaShow(parent: Command): void {
  parent
    .command('show')
    .allowExcessArguments(false)
    .description(
      'Display the full definition of the active schema, including all artifact types, fields, and extraction rules.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    schema: { name: string, version: string }
    artifacts: Array<{ id: string, scope: string, optional: boolean, requires: string[], format: string, delta: boolean }>
    workflow: Array<{ step: string, requires: string[] }>
  }
`,
    )
    .action(async (opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const schema = await kernel.specs.getActiveSchema.execute()

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          const artifactLines = schema.artifacts().map((a) => {
            const label = a.optional ? 'optional' : 'required'
            const requires = a.requires
            const reqStr = requires.length > 0 ? `  requires=[${requires.join(',')}]` : ''
            const outStr = `  output=${a.output}`
            const descStr = a.description !== undefined ? `  [${a.description}]` : ''
            return `  ${a.id}  ${a.scope}  ${label}${reqStr}${outStr}${descStr}`
          })
          const workflowLines = schema.workflow().map((s) => {
            const reqStr = `requires=[${s.requires.join(',')}]`
            return `  ${s.step}  ${reqStr}`
          })
          const lines = [
            `schema: ${schema.name()}  version: ${schema.version()}`,
            '',
            `artifacts:`,
            ...artifactLines,
            '',
            `workflow:`,
            ...workflowLines,
          ]
          output(lines.join('\n'), 'text')
        } else {
          output(
            {
              schema: { name: schema.name(), version: schema.version() },
              artifacts: schema.artifacts().map((a) => ({
                id: a.id,
                scope: a.scope,
                optional: a.optional,
                requires: [...a.requires],
                format: a.format,
                delta: a.delta,
                description: a.description ?? null,
                output: a.output,
                hasTaskCompletionCheck: a.taskCompletionCheck !== undefined,
              })),
              workflow: schema.workflow().map((s) => ({
                step: s.step,
                requires: [...s.requires],
              })),
            },
            fmt,
          )
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
