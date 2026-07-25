import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Resolves a CLI spec path to a canonical spec ID.
 *
 * @param specPath - User-supplied spec path
 * @param config - Loaded project configuration
 * @returns Canonical spec ID
 */
function resolveSpecId(specPath: string, config: import('@specd/sdk').SpecdConfig): string {
  return parseSpecId(specPath, config).specId
}

/**
 * Renders a persisted dependency query or mutation result.
 *
 * @param result - Dependency payload from the kernel
 * @param result.specId - Canonical spec ID
 * @param result.dependsOn - Persisted dependency list
 * @param result.initialized - Whether durable spec state exists
 * @param fmt - Output format
 */
function renderDepsResult(
  result: { specId: string; dependsOn: readonly string[]; initialized?: boolean },
  fmt: ReturnType<typeof parseFormat>,
): void {
  if (fmt === 'text') {
    if (result.initialized === false) {
      output(`spec ${result.specId} is not initialized — run specs init first`, 'text')
      return
    }
    if (result.dependsOn.length === 0) {
      output(`dependsOn: (empty)`, 'text')
      return
    }
    output('dependsOn:', 'text')
    for (const dep of result.dependsOn) {
      output(`  ${dep}`, 'text')
    }
    return
  }

  output(
    {
      result: 'ok',
      specId: result.specId,
      dependsOn: result.dependsOn,
      ...(result.initialized !== undefined ? { initialized: result.initialized } : {}),
    },
    fmt,
  )
}

/**
 * Registers the `spec deps` command group.
 *
 * @param parent - Parent commander command
 */
export function registerSpecDeps(parent: Command): void {
  const command = parent
    .command('deps')
    .description('Inspect and mutate persisted spec dependencies (spec-lock.json dependsOn).')

  command
    .command('list <specPath>')
    .allowExcessArguments(false)
    .description('List persisted dependencies for a spec.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.getPersistedDeps.execute({
          specId: resolveSpecId(specPath, config),
        })
        renderDepsResult(result, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('add <specPath>')
    .allowExcessArguments(false)
    .description('Add persisted dependencies.')
    .requiredOption('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        if (opts.dep.length === 0) {
          cliError('--dep requires at least one value', opts.format)
        }
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: resolveSpecId(specPath, config),
          add: opts.dep,
        })
        renderDepsResult({ ...result, initialized: true }, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('remove <specPath>')
    .allowExcessArguments(false)
    .description('Remove persisted dependencies.')
    .requiredOption('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        if (opts.dep.length === 0) {
          cliError('--dep requires at least one value', opts.format)
        }
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: resolveSpecId(specPath, config),
          remove: opts.dep,
        })
        renderDepsResult({ ...result, initialized: true }, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('set <specPath>')
    .allowExcessArguments(false)
    .description('Replace persisted dependencies.')
    .option('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: resolveSpecId(specPath, config),
          set: opts.dep,
        })
        renderDepsResult({ ...result, initialized: true }, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('clear <specPath>')
    .allowExcessArguments(false)
    .description('Clear all persisted dependencies.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: resolveSpecId(specPath, config),
          clear: true,
        })
        renderDepsResult({ ...result, initialized: true }, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}
