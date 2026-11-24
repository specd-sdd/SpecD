import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { confirmOrExit } from '../../helpers/confirm.js'

const depsOutputSchema = `\nJSON/TOON output schema:
  {
    result: "ok"
    specId: string
    dependsOn: string[]
    initialized?: boolean
  }\n`

const clearOutputSchema = `${depsOutputSchema}
  When cancelled:
  { result: "cancelled" }\n`

/**
 * Renders a persisted dependency query or mutation result.
 *
 * @param result - Dependency payload from the kernel
 * @param result.specId - Canonical spec ID
 * @param result.dependsOn - Persisted dependency list
 * @param result.initialized - Whether durable spec state exists
 * @param fmt - Output format
 * @param notInitializedText - Text printed when the spec has no durable state
 */
function renderDepsResult(
  result: { specId: string; dependsOn: readonly string[]; initialized?: boolean },
  fmt: ReturnType<typeof parseFormat>,
  notInitializedText: string = `spec ${result.specId} is not initialized — run specs init first`,
): void {
  if (fmt === 'text') {
    if (result.initialized === false) {
      output(notInitializedText, 'text')
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
    .addHelpText('after', depsOutputSchema)
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.getPersistedDeps.execute({
          specId: specPath,
        })
        renderDepsResult(result, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format, { command: 'specs.deps', lockRepairHint: true })
      }
    })

  command
    .command('add <specPath>')
    .allowExcessArguments(false)
    .description('Add persisted dependencies.')
    .requiredOption('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText('after', depsOutputSchema)
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        if (opts.dep.length === 0) {
          cliError('--dep requires at least one value', opts.format)
        }
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: specPath,
          add: opts.dep,
        })
        renderDepsResult(result, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format, { command: 'specs.deps', lockRepairHint: true })
      }
    })

  command
    .command('remove <specPath>')
    .allowExcessArguments(false)
    .description('Remove persisted dependencies.')
    .requiredOption('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText('after', depsOutputSchema)
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        if (opts.dep.length === 0) {
          cliError('--dep requires at least one value', opts.format)
        }
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: specPath,
          remove: opts.dep,
        })
        renderDepsResult(
          result,
          parseFormat(opts.format),
          `spec ${result.specId} is not initialized — nothing was removed`,
        )
      } catch (err) {
        handleError(err, opts.format, { command: 'specs.deps', lockRepairHint: true })
      }
    })

  command
    .command('set <specPath>')
    .allowExcessArguments(false)
    .description('Replace persisted dependencies.')
    .option('--dep <id>', 'dependency spec id (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText('after', depsOutputSchema)
    .action(async (specPath: string, opts: { dep: string[]; format: string; config?: string }) => {
      try {
        const { kernel } = await resolveCliContext({ configPath: opts.config })
        const result = await kernel.specs.updatePersistedDeps.execute({
          specId: specPath,
          set: opts.dep,
        })
        renderDepsResult(result, parseFormat(opts.format))
      } catch (err) {
        handleError(err, opts.format, { command: 'specs.deps', lockRepairHint: true })
      }
    })

  command
    .command('clear <specPath>')
    .allowExcessArguments(false)
    .description('Clear all persisted dependencies.')
    .option('--force', 'skip confirmation')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText('after', clearOutputSchema)
    .action(
      async (specPath: string, opts: { force?: boolean; format: string; config?: string }) => {
        try {
          const fmt = parseFormat(opts.format)
          const confirmed = await confirmOrExit({
            message: `Clear all dependencies of ${specPath}?`,
            nonInteractiveMessage: 'clearing requires confirmation; pass --force to skip it',
            format: opts.format,
            ...(opts.force !== undefined ? { force: opts.force } : {}),
          })
          if (!confirmed) {
            if (fmt === 'text') {
              output('cancelled', 'text')
            } else {
              output({ result: 'cancelled' }, fmt)
            }
            return
          }

          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const result = await kernel.specs.updatePersistedDeps.execute({
            specId: specPath,
            clear: true,
          })
          renderDepsResult(result, parseFormat(opts.format))
        } catch (err) {
          handleError(err, opts.format, { command: 'specs.deps', lockRepairHint: true })
        }
      },
    )
}
