import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `change validate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeValidate(parent: Command): void {
  parent
    .command('validate <name> <specPath>')
    .allowExcessArguments(false)
    .description('Validate artifact files against the active schema')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    passed: boolean
    failures: Array<{ artifactId: string, description: string }>
    warnings: Array<{ artifactId: string, description: string }>
  }
`,
    )
    .action(async (name: string, specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({
          configPath: opts.config,
        })
        const parsed = parseSpecId(specPath, config)
        const fullSpecPath = `${parsed.workspace}:${parsed.capabilityPath}`

        const result = await kernel.changes.validate.execute({
          name,
          specPath: fullSpecPath,
        })

        const fmt = parseFormat(opts.format)
        const passed = result.failures.length === 0

        if (fmt === 'text') {
          if (passed) {
            if (result.warnings.length > 0) {
              const warningLines = result.warnings.map(
                (w) => `warning: ${w.artifactId} — ${w.description}`,
              )
              output(
                `validated ${name}/${fullSpecPath}: pass (${result.warnings.length} warning(s))\n${warningLines.join('\n')}`,
                'text',
              )
            } else {
              output(`validated ${name}/${fullSpecPath}: all artifacts pass`, 'text')
            }
          } else {
            const errorLines = result.failures.map(
              (f) => `  error: ${f.artifactId} — ${f.description}`,
            )
            const warningLines = result.warnings.map(
              (w) => `  warning: ${w.artifactId} — ${w.description}`,
            )
            const allLines = [...errorLines, ...warningLines]
            output(`validation failed ${name}/${fullSpecPath}:\n${allLines.join('\n')}`, 'text')
            process.exitCode = 1
          }
        } else {
          output(
            {
              passed,
              failures: result.failures,
              warnings: result.warnings,
            },
            fmt,
          )
          if (!passed) {
            process.exitCode = 1
          }
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
