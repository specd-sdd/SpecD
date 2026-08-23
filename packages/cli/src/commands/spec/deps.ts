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

  command
    .command('suggest [specPath]')
    .allowExcessArguments(false)
    .description('Suggest spec dependencies based on AST import tracing.')
    .option('--spec <id>', 'spec id (repeatable)', collect, [])
    .option('--all', 'suggest for all specs')
    .option('--workspace <name>', 'target workspace')
    .option('--apply', 'apply suggested dependencies to spec-lock.json')
    .option('--create-change', 'create alignment change if invalid specs exist after applying')
    .option('--rebuild-cache', 'force cache invalidation')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string | undefined,
        opts: {
          spec: string[]
          all?: boolean
          workspace?: string
          apply?: boolean
          createChange?: boolean
          rebuildCache?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { config } = await resolveCliContext({ configPath: opts.config })
          const { createSuggestSpecDependencies } = await import('@specd/sdk')
          const useCase = createSuggestSpecDependencies(config)
          const targetSpecId = specPath ? resolveSpecId(specPath, config) : undefined
          const specIds =
            opts.spec.length > 0 ? opts.spec.map((s) => resolveSpecId(s, config)) : undefined
          const fmt = parseFormat(opts.format)

          const isInteractiveText =
            fmt === 'text' && Boolean(process.stderr?.isTTY || process.stdout?.isTTY)
          const spinner = isInteractiveText
            ? (await import('nanospinner'))
                .createSpinner('Analyzing specification dependencies...')
                .start()
            : null

          let result
          try {
            result = await useCase.execute({
              ...(targetSpecId !== undefined ? { specId: targetSpecId } : {}),
              ...(specIds !== undefined ? { specIds } : {}),
              ...(opts.workspace !== undefined ? { workspace: opts.workspace } : {}),
              ...(opts.all !== undefined ? { all: opts.all } : {}),
              ...(opts.apply !== undefined ? { apply: opts.apply } : {}),
              ...(opts.createChange !== undefined
                ? { createAlignmentChange: opts.createChange }
                : {}),
              ...(opts.rebuildCache !== undefined ? { rebuildCache: opts.rebuildCache } : {}),
              ...(spinner
                ? {
                    onProgress: (evt) => {
                      if (evt.type === 'warmup-start') {
                        spinner.update({
                          text: 'Warming up implementation cache across workspaces...',
                        })
                      } else if (
                        evt.type === 'warmup-progress' &&
                        evt.event.type === 'discovery-start'
                      ) {
                        spinner.update({ text: 'Discovering specifications across workspaces...' })
                      } else if (
                        evt.type === 'warmup-progress' &&
                        evt.event.type === 'spec-start'
                      ) {
                        spinner.update({
                          text: `[${evt.event.index}/${evt.event.totalSpecs}] Warming cache: ${evt.event.specId}...`,
                        })
                      } else if (evt.type === 'start') {
                        spinner.update({
                          text: `Tracing dependencies for ${evt.totalSpecs} specification(s)...`,
                        })
                      } else if (evt.type === 'spec-start') {
                        spinner.update({
                          text: `[${evt.index}/${evt.totalSpecs}] Tracing dependencies: ${evt.specId}...`,
                        })
                      } else if (evt.type === 'validation-start') {
                        spinner.update({ text: 'Validating specifications consistency...' })
                      }
                    },
                  }
                : {}),
            })
            if (spinner) {
              spinner.stop()
            }
          } catch (err) {
            if (spinner) {
              spinner.error({ text: 'Dependency analysis failed' })
            }
            throw err
          }

          if (fmt === 'text') {
            output('suggested spec dependencies:', 'text')
            for (const spec of result.specs) {
              output(`  ${spec.specId}`, 'text')
              if (spec.existingDependsOn.length > 0) {
                output(`    existing dependsOn:`, 'text')
                for (const d of spec.existingDependsOn) {
                  output(`      ${d}`, 'text')
                }
              }
              if (spec.suggestedDependsOn.length === 0) {
                output(`    suggested dependsOn: (none)`, 'text')
              } else {
                output(`    suggested dependsOn:`, 'text')
                for (const sug of spec.suggestedDependsOn) {
                  const tag = sug.alreadyIncluded ? '[already included]' : '[new]'
                  output(`      ${sug.specId} ${tag} (${sug.reason})`, 'text')
                }
              }
            }
            if (result.appliedMutations) {
              output(
                `applied mutations: updated ${result.appliedMutations.updatedSpecsCount} specs (${result.appliedMutations.depsAddedCount} dependencies added)`,
                'text',
              )
            }
            if (result.postApplyValidation) {
              if (result.postApplyValidation.status === 'all-valid') {
                output('post-apply validation: all specs valid', 'text')
              } else {
                output('post-apply validation: invalid specs detected!', 'text')
                if (result.postApplyValidation.createdChange) {
                  output(
                    `created alignment change: ${result.postApplyValidation.createdChange.name} at ${result.postApplyValidation.createdChange.changePath}`,
                    'text',
                  )
                } else if (result.postApplyValidation.suggestedAlignmentCommand) {
                  output(
                    `run alignment command: ${result.postApplyValidation.suggestedAlignmentCommand}`,
                    'text',
                  )
                }
              }
            }
          } else {
            output(result, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
