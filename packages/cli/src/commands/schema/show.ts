import { type Command } from 'commander'
import { resolve } from 'node:path'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Registers the `schema show` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSchemaShow(parent: Command): void {
  parent
    .command('show [ref]')
    .allowExcessArguments(false)
    .description(
      'Display the full definition of a schema, including all artifact types, fields, and extraction rules.',
    )
    .option('--file <path>', 'show a schema from a file')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    schema: { name: string, version: string }
    mode: "project" | "ref" | "file"
    artifacts: Array<{ id: string, scope: string, optional: boolean, requires: string[], format: string, delta: boolean }>
    workflow: Array<{ step: string, requires: string[] }>
  }
`,
    )
    .action(
      async (ref: string | undefined, opts: { file?: string; format: string; config?: string }) => {
        if (ref !== undefined && opts.file !== undefined) {
          cliError('[ref] and --file are mutually exclusive', opts.format)
        }

        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const input =
            ref !== undefined
              ? { mode: 'ref' as const, ref }
              : opts.file !== undefined
                ? { mode: 'file' as const, filePath: resolve(opts.file) }
                : undefined

          const mode = ref !== undefined ? 'ref' : opts.file !== undefined ? 'file' : 'project'
          const schema = await kernel.specs.getActiveSchema.execute(input)

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
                mode,
                plugins: [] as string[],
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
      },
    )
}
