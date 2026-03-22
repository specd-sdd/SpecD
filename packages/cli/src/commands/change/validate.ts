import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Registers the `change validate` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeValidate(parent: Command): void {
  parent
    .command('validate <name> [specPath]')
    .allowExcessArguments(false)
    .description('Validate artifact files against the active schema')
    .option('--all', 'validate all specIds in the change')
    .option('--artifact <artifactId>', 'validate only this artifact')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        specPath: string | undefined,
        opts: { format: string; config?: string; artifact?: string; all?: boolean },
      ) => {
        try {
          // --- Flag validation ---
          if (opts.all === true && specPath !== undefined) {
            cliError('--all and <specPath> are mutually exclusive', opts.format)
          }
          if (opts.all !== true && specPath === undefined) {
            cliError('either <specPath> or --all is required', opts.format)
          }

          const { config, kernel } = await resolveCliContext({
            configPath: opts.config,
          })

          if (opts.all === true) {
            await executeBatch(kernel, name, opts)
          } else {
            await executeSingle(kernel, config, name, specPath!, opts)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Validates a single spec (existing behaviour).
 *
 * @param kernel - The wired kernel instance
 * @param config - The loaded specd configuration
 * @param name - The change name
 * @param specPath - The spec ID to validate
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.artifact - Optional artifact ID to validate
 */
async function executeSingle(
  kernel: import('@specd/core').Kernel,
  config: import('@specd/core').SpecdConfig,
  name: string,
  specPath: string,
  opts: { format: string; artifact?: string },
): Promise<void> {
  const parsed = parseSpecId(specPath, config)
  const fullSpecPath = `${parsed.workspace}:${parsed.capabilityPath}`

  const result = await kernel.changes.validate.execute({
    name,
    specPath: fullSpecPath,
    ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
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
      const errorLines = result.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
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
}

/**
 * Validates all specIds in the change.
 *
 * @param kernel - The wired kernel instance
 * @param name - The change name
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.artifact - Optional artifact ID to validate per spec
 */
async function executeBatch(
  kernel: import('@specd/core').Kernel,
  name: string,
  opts: { format: string; artifact?: string },
): Promise<void> {
  const { change } = await kernel.changes.status.execute({ name })
  const specIds = change.specIds

  if (specIds.length === 0) {
    const fmt = parseFormat(opts.format)
    if (fmt === 'text') {
      output(`${name}: no specIds declared`, 'text')
    } else {
      output({ passed: true, total: 0, results: [] }, fmt)
    }
    return
  }

  const results: Array<{
    spec: string
    passed: boolean
    failures: Array<{ artifactId: string; description: string }>
    warnings: Array<{ artifactId: string; description: string }>
  }> = []
  let totalPassed = 0

  for (const specId of specIds) {
    const result = await kernel.changes.validate.execute({
      name,
      specPath: specId,
      ...(opts.artifact !== undefined ? { artifactId: opts.artifact } : {}),
    })

    const passed = result.failures.length === 0
    if (passed) totalPassed++
    results.push({
      spec: specId,
      passed,
      failures: result.failures,
      warnings: result.warnings,
    })
  }

  const allPassed = totalPassed === specIds.length
  const fmt = parseFormat(opts.format)

  if (fmt === 'text') {
    for (const r of results) {
      if (r.passed) {
        if (r.warnings.length > 0) {
          const warningLines = r.warnings.map((w) => `warning: ${w.artifactId} — ${w.description}`)
          output(
            `validated ${name}/${r.spec}: pass (${r.warnings.length} warning(s))\n${warningLines.join('\n')}`,
            'text',
          )
        } else {
          output(`validated ${name}/${r.spec}: all artifacts pass`, 'text')
        }
      } else {
        const errorLines = r.failures.map((f) => `  error: ${f.artifactId} — ${f.description}`)
        const warningLines = r.warnings.map((w) => `  warning: ${w.artifactId} — ${w.description}`)
        const allLines = [...errorLines, ...warningLines]
        output(`validation failed ${name}/${r.spec}:\n${allLines.join('\n')}`, 'text')
      }
    }
    output(`validated ${totalPassed}/${specIds.length} specs`, 'text')
  } else {
    output(
      {
        passed: allPassed,
        total: specIds.length,
        results,
      },
      fmt,
    )
  }

  if (!allPassed) {
    process.exitCode = 1
  }
}
