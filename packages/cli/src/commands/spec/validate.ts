import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `spec validate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecValidate(parent: Command): void {
  parent
    .command('validate [specPath]')
    .description('Validate spec artifacts against the active schema')
    .option('--all', 'validate all specs across all workspaces')
    .option('--workspace <name>', 'validate all specs in a workspace')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string | undefined,
        opts: { all?: boolean; workspace?: string; format: string; config?: string },
      ) => {
        try {
          if (specPath === undefined && opts.all !== true && opts.workspace === undefined) {
            process.stderr.write('error: specify a spec path, --all, or --workspace <name>\n')
            process.exit(1)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          let inputSpecPath: string | undefined
          let inputWorkspace: string | undefined

          if (specPath !== undefined) {
            const parsed = parseSpecId(specPath, config)
            inputSpecPath = `${parsed.workspace}:${parsed.capabilityPath}`
          } else if (opts.workspace !== undefined) {
            const wsNames = config.workspaces.map((w) => w.name)
            if (!wsNames.includes(opts.workspace)) {
              process.stderr.write(`error: unknown workspace '${opts.workspace}'\n`)
              process.exit(1)
            }
            inputWorkspace = opts.workspace
          }
          // --all: both undefined → validates everything

          const result = await kernel.specs.validate.execute({
            ...(inputSpecPath !== undefined ? { specPath: inputSpecPath } : {}),
            ...(inputWorkspace !== undefined ? { workspace: inputWorkspace } : {}),
          })

          const fmt = parseFormat(opts.format)

          if (inputSpecPath !== undefined && result.totalSpecs === 0) {
            process.stderr.write(`error: spec not found '${inputSpecPath}'\n`)
            process.exit(1)
          }

          if (fmt === 'text') {
            const isSingle = inputSpecPath !== undefined
            if (isSingle) {
              const entry = result.entries[0]!
              if (entry.passed) {
                output(`validated ${entry.spec}: all artifacts pass`, 'text')
              } else {
                const lines = entry.failures.map(
                  (f) => `  error: ${f.artifactId} — ${f.description}`,
                )
                const warnLines = entry.warnings.map(
                  (w) => `  warning: ${w.artifactId} — ${w.description}`,
                )
                output(
                  `validation failed ${entry.spec}:\n${[...lines, ...warnLines].join('\n')}`,
                  'text',
                )
                process.exit(1)
              }
            } else {
              const failedEntries = result.entries.filter((e) => !e.passed)
              output(
                `validated ${result.totalSpecs} specs: ${result.passed} passed, ${result.failed} failed`,
                'text',
              )
              if (failedEntries.length > 0) {
                process.stdout.write('\n')
                for (const entry of failedEntries) {
                  process.stdout.write(`\n  FAIL  ${entry.spec}\n`)
                  for (const f of entry.failures) {
                    process.stdout.write(`    error: ${f.artifactId} — ${f.description}\n`)
                  }
                  for (const w of entry.warnings) {
                    process.stdout.write(`    warning: ${w.artifactId} — ${w.description}\n`)
                  }
                }
                process.exit(1)
              }
            }
          } else {
            output(result, fmt)
            if (result.failed > 0) {
              process.exit(1)
            }
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
