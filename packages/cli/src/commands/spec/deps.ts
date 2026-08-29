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
    .option('-y, --yes', 'automatically apply deduced dependencies without prompting')
    .option('--create-change', 'create alignment change if invalid specs exist after applying')
    .option('--rebuild-cache', 'force cache invalidation')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    result: "ok",
    targetWorkspace?: string,
    specs: Array<{
      specId: string,
      title: string,
      existingDependsOn: string[],
      suggestedDependsOn: Array<{
        specId: string,
        title: string,
        reason: string,
        status?: "already-configured" | "new",
        alreadyIncluded?: boolean
      }>
    }>,
    appliedMutations?: { updatedSpecsCount: number, depsAddedCount: number },
    postApplyValidation?: {
      status: "all-valid" | "invalid-specs-detected",
      invalidSpecs: Array<{ specId: string, failures: Array<{ artifactId: string, description: string }> }>,
      suggestedAlignmentCommand?: string,
      createdChange?: { name: string, changePath: string, specIds: string[] }
    }
  }

Example:
  specd specs deps suggest cli:spec-deps --apply --format toon
`,
    )
    .action(
      async (
        specPath: string | undefined,
        opts: {
          spec: string[]
          all?: boolean
          workspace?: string
          apply?: boolean
          yes?: boolean
          createChange?: boolean
          rebuildCache?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const { createSuggestSpecDependencies } = await import('@specd/sdk')
          const useCase = createSuggestSpecDependencies(config)
          const targetSpecId = specPath ? resolveSpecId(specPath, config) : undefined
          const specIds =
            opts.spec.length > 0 ? opts.spec.map((s) => resolveSpecId(s, config)) : undefined
          const fmt = parseFormat(opts.format)

          const isInteractiveText =
            fmt === 'text' && Boolean(process.stderr?.isTTY || process.stdout?.isTTY)
          const isInteractiveApply = opts.apply === true && !opts.yes && isInteractiveText

          const clack = isInteractiveText ? await import('@clack/prompts') : null
          if (clack) {
            clack.intro('SpecD — Suggest spec dependencies')
          }

          const s = clack ? clack.spinner() : null
          if (s) {
            s.start('Analyzing specification dependencies...')
          }

          let result
          try {
            result = await useCase.execute({
              ...(targetSpecId !== undefined ? { specId: targetSpecId } : {}),
              ...(specIds !== undefined ? { specIds } : {}),
              ...(opts.workspace !== undefined ? { workspace: opts.workspace } : {}),
              ...(opts.all !== undefined ? { all: opts.all } : {}),
              // In interactive apply, run dry-run first so user can confirm selection
              ...(isInteractiveApply
                ? { apply: false }
                : opts.apply !== undefined
                  ? { apply: opts.apply }
                  : {}),
              ...(opts.createChange !== undefined && !isInteractiveApply
                ? { createAlignmentChange: opts.createChange }
                : {}),
              ...(opts.rebuildCache !== undefined ? { rebuildCache: opts.rebuildCache } : {}),
              onProgress: (evt) => {
                if (evt.type === 'stale-warning') {
                  if (clack && s) {
                    s.stop('Code graph index is stale')
                    clack.log.warn('Code graph index is stale. Run \'specd graph index\' for the most up-to-date analysis.')
                    s.start('Analyzing specification dependencies...')
                  } else if (fmt === 'text') {
                    output('warning: code graph index is stale. Run \'specd graph index\' to update.', 'text')
                  }
                } else if (s) {
                  if (evt.type === 'warmup-start') {
                    s.message('Warming up implementation cache across workspaces...')
                  } else if (
                    evt.type === 'warmup-progress' &&
                    evt.event.type === 'discovery-start'
                  ) {
                    s.message('Discovering specifications across workspaces...')
                  } else if (
                    evt.type === 'warmup-progress' &&
                    evt.event.type === 'spec-start'
                  ) {
                    s.message(
                      `[${evt.event.index}/${evt.event.totalSpecs}] Warming cache: ${evt.event.specId}...`,
                    )
                  } else if (evt.type === 'start') {
                    s.message(`Tracing dependencies for ${evt.totalSpecs} specification(s)...`)
                  } else if (evt.type === 'spec-start') {
                    s.message(
                      `[${evt.index}/${evt.totalSpecs}] Tracing dependencies: ${evt.specId}...`,
                    )
                  } else if (evt.type === 'validation-start') {
                    s.message('Validating specifications consistency...')
                  }
                }
              },
            })
            if (s) {
              s.stop('Dependency analysis complete')
            }
          } catch (err) {
            if ((err as { code?: string })?.code === 'CACHE_LOCKED') {
              if (s) {
                s.stop('Suggestion cache is busy')
              }
              if (clack) {
                clack.log.info(
                  'The suggestion cache is currently in use by another process. Please wait for the other process to finish and try again.',
                )
                clack.outro('Command ended.')
                process.exit(1)
              }
            }
            if (s) {
              s.stop('Dependency analysis failed', 1)
            }
            throw err
          }

          // Handle interactive apply prompting
          if (isInteractiveApply && clack) {
            const { promptSelectSpecDependencies } = await import('../../helpers/prompt-apply.js')

            const specsWithSuggestions = result.specs.filter((s) => s.suggestedDependsOn.length > 0)

            let updatedSpecsCount = 0
            let depsAddedCount = 0
            let wasCancelled = false

            for (let i = 0; i < specsWithSuggestions.length; i++) {
              const spec = specsWithSuggestions[i]!
              const hasNext = i < specsWithSuggestions.length - 1
              const selected = await promptSelectSpecDependencies(
                spec.specId,
                spec.suggestedDependsOn,
                { hasNext, existingDependsOn: spec.existingDependsOn },
              )

              if (selected === null) {
                clack.outro('Apply cancelled.')
                wasCancelled = true
                break
              }

              if (selected.length > 0) {
                updatedSpecsCount++
                depsAddedCount += selected.length
                await kernel.specs.updatePersistedDeps.execute({
                  specId: spec.specId,
                  add: selected.map((s) => s.specId),
                })
              }
            }

            if (wasCancelled) {
              return
            }

            if (updatedSpecsCount > 0) {
              // Run post-apply validation
              const validationResult = await kernel.specs.validate.execute({})
              const invalidSpecs: Array<{
                specId: string
                failures: Array<{ artifactId: string; description: string }>
              }> = []

              for (const entry of validationResult.entries) {
                if (!entry.passed) {
                  invalidSpecs.push({
                    specId: entry.spec,
                    failures: entry.failures.map((f) => ({
                      artifactId: f.artifactId,
                      description: f.description,
                    })),
                  })
                }
              }

              const status = invalidSpecs.length === 0 ? 'all-valid' : 'invalid-specs-detected'

              let createdChange
              let suggestedAlignmentCommand: string | undefined

              if (status === 'invalid-specs-detected') {
                if (opts.createChange) {
                  const now = new Date()
                  const pad = (n: number): string => String(n).padStart(2, '0')
                  const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
                  const changeName = `align-spec-deps-${timestamp}`
                  const invalidSpecIds = invalidSpecs.map((s) => s.specId)

                  const explorationLines = [
                    '# Exploration: Automated Spec Dependency Alignment',
                    '',
                    'The following specifications failed schema consistency validation after automated dependency updates:',
                    '',
                    ...invalidSpecs.flatMap((s) => [
                      `## Specification: ${s.specId}`,
                      ...s.failures.map((f) => `- [${f.artifactId}]: ${f.description}`),
                      '',
                    ]),
                  ]

                  const created = await kernel.changes.create.execute({
                    name: changeName,
                    specIds: invalidSpecIds,
                    description: 'Align spec dependencies across workspaces',
                    explorationContent: explorationLines.join('\n'),
                  })

                  createdChange = {
                    name: created.change.name,
                    changePath: created.changePath,
                    specIds: invalidSpecIds,
                  }
                } else {
                  const specArgs = invalidSpecs.map((s) => `--spec ${s.specId}`).join(' ')
                  suggestedAlignmentCommand = `specd new align-spec-deps ${specArgs}`
                }
              }

              result = {
                ...result,
                appliedMutations: {
                  updatedSpecsCount,
                  depsAddedCount,
                },
                postApplyValidation: {
                  status,
                  invalidSpecs,
                  ...(suggestedAlignmentCommand ? { suggestedAlignmentCommand } : {}),
                  ...(createdChange ? { createdChange } : {}),
                },
              }
            }
          }

          if (fmt === 'text') {
            const chalk = (await import('chalk')).default
            const lines: string[] = []
            for (const spec of result.specs) {
              lines.push(`[${chalk.bold(spec.specId)}]`)
              if (spec.existingDependsOn.length > 0) {
                lines.push('  existing dependsOn:')
                for (const d of spec.existingDependsOn) {
                  lines.push(`    ${d}`)
                }
              }
              if (spec.suggestedDependsOn.length === 0) {
                lines.push('  suggested dependsOn: (none)')
              } else {
                lines.push('  suggested dependsOn:')
                for (const sug of spec.suggestedDependsOn) {
                  const tag = sug.alreadyIncluded ? '[already included]' : '[new]'
                  lines.push(`    ${tag} ${sug.specId} (${sug.reason})`)
                }
              }
              lines.push('')
            }
            if (result.appliedMutations) {
              lines.push(
                `applied mutations: updated ${result.appliedMutations.updatedSpecsCount} specs (${result.appliedMutations.depsAddedCount} dependencies added)`,
              )
            }
            if (result.postApplyValidation) {
              if (result.postApplyValidation.status === 'all-valid') {
                lines.push('post-apply validation: all specs valid')
              } else {
                lines.push('post-apply validation: invalid specs detected!')
                if (result.postApplyValidation.createdChange) {
                  lines.push(
                    `created alignment change: ${result.postApplyValidation.createdChange.name} at ${result.postApplyValidation.createdChange.changePath}`,
                  )
                } else if (result.postApplyValidation.suggestedAlignmentCommand) {
                  lines.push(
                    `run alignment command: ${result.postApplyValidation.suggestedAlignmentCommand}`,
                  )
                }
              }
            }

            if (clack) {
              const { wrapForClack } = await import('../../helpers/prompt-apply.js')
              clack.note(
                wrapForClack(lines.join('\n').trim()),
                'Suggested specification dependencies',
              )
              if (isInteractiveApply) {
                const applied = result.appliedMutations
                clack.outro(
                  applied && applied.updatedSpecsCount > 0
                    ? `Applied ${applied.depsAddedCount} dependenc(ies) across ${applied.updatedSpecsCount} spec(s).`
                    : 'No new spec dependencies were applied.',
                )
              } else {
                const totalSuggestions = result.specs.reduce(
                  (acc, s) => acc + s.suggestedDependsOn.length,
                  0,
                )
                clack.outro(
                  `Found ${totalSuggestions} dependency suggestion(s) across ${result.specs.length} spec(s).`,
                )
              }
            } else {
              output('suggested spec dependencies:', 'text')
              for (const line of lines) {
                if (line) output(`  ${line}`, 'text')
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
