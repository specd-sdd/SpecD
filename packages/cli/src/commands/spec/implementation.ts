import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/**
 * Renders persisted implementation links for a spec.
 *
 * @param specId - Canonical spec ID
 * @param implementation - Persisted implementation links
 * @param initialized - Whether durable spec state exists
 * @param fmt - Output format
 */
function renderImplementationLinks(
  specId: string,
  implementation: readonly {
    readonly file: string
    readonly symbols?: readonly string[] | undefined
  }[],
  initialized: boolean,
  fmt: ReturnType<typeof parseFormat>,
): void {
  if (fmt === 'text') {
    if (!initialized) {
      output(`spec ${specId} is not initialized — run specs init first`, 'text')
      return
    }
    if (implementation.length === 0) {
      output('implementation: (empty)', 'text')
      return
    }
    output('implementation:', 'text')
    for (const link of implementation) {
      if (link.symbols !== undefined && link.symbols.length > 0) {
        output(`  ${link.file} [${link.symbols.join(', ')}]`, 'text')
      } else {
        output(`  ${link.file}`, 'text')
      }
    }
    return
  }

  output({ result: 'ok', specId, initialized, implementation }, fmt)
}

/**
 * Registers the `spec implementation` command group.
 *
 * @param parent - Parent commander command
 */
export function registerSpecImplementation(parent: Command): void {
  const command = parent
    .command('implementation')
    .description('Inspect and mutate persisted implementation links for a spec.')

  command
    .command('list <specPath>')
    .allowExcessArguments(false)
    .description('List persisted implementation links.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.getPersistedImplementation.execute({ specId })
        renderImplementationLinks(
          result.specId,
          result.implementation,
          result.initialized,
          parseFormat(opts.format),
        )
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('add <specPath>')
    .allowExcessArguments(false)
    .description('Add or enrich a persisted implementation link.')
    .requiredOption('--file <path>', 'project-relative file path')
    .option('--symbol <name>', 'symbol name (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string,
        opts: { file: string; symbol: string[]; format: string; config?: string },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const specId = parseSpecId(specPath, config).specId
          const result = await kernel.specs.updatePersistedImplementation.execute({
            specId,
            action: 'add',
            file: opts.file,
            ...(opts.symbol.length > 0 ? { symbols: opts.symbol } : {}),
          })
          renderImplementationLinks(
            result.specId,
            result.implementation,
            true,
            parseFormat(opts.format),
          )
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )

  command
    .command('remove <specPath>')
    .allowExcessArguments(false)
    .description('Remove a persisted implementation link or specific symbols.')
    .requiredOption('--file <path>', 'project-relative file path')
    .option('--symbol <name>', 'symbol name (repeatable)', collect, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string,
        opts: { file: string; symbol: string[]; format: string; config?: string },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const specId = parseSpecId(specPath, config).specId
          const result = await kernel.specs.updatePersistedImplementation.execute({
            specId,
            action: 'remove',
            file: opts.file,
            ...(opts.symbol.length > 0 ? { symbols: opts.symbol } : {}),
          })
          renderImplementationLinks(
            result.specId,
            result.implementation,
            true,
            parseFormat(opts.format),
          )
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )

  command
    .command('suggest [specPath]')
    .allowExcessArguments(false)
    .description('Suggest implementation links for specs based on static analysis.')
    .option('--spec <id>', 'spec id (repeatable)', collect, [])
    .option('--all', 'suggest for all specs')
    .option('--workspace <name>', 'target workspace')
    .option('--apply', 'apply suggested links to spec-lock.json')
    .option(
      '-y, --yes',
      'automatically apply suggestions meeting confidence threshold without prompting',
    )
    .option('--confidence <level>', 'confidence threshold: HIGH|MEDIUM|MED|LOW')
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
      existing: { files: string[], symbols: string[], dependsOn: string[] },
      suggestions: Array<{
        file: string,
        symbols: string[],
        confidence: "HIGH" | "MEDIUM" | "LOW",
        reasons: string[],
        score: number,
        alreadyIncluded: boolean
      }>
    }>,
    appliedMutations?: { updatedSpecsCount: number, filesAddedCount: number, symbolsAddedCount: number }
  }

Example:
  specd specs implementation suggest cli:spec-implementation --format json
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
          confidence?: string
          rebuildCache?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const { createSuggestImplementationLinks } = await import('@specd/sdk')
          const useCase = createSuggestImplementationLinks(config)
          const targetSpecId = specPath ? parseSpecId(specPath, config).specId : undefined
          const specIds =
            opts.spec.length > 0 ? opts.spec.map((s) => parseSpecId(s, config).specId) : undefined
          const fmt = parseFormat(opts.format)

          const isInteractiveText =
            fmt === 'text' && Boolean(process.stderr?.isTTY || process.stdout?.isTTY)
          const isInteractiveApply = opts.apply === true && !opts.yes && isInteractiveText

          // When auto-applying via --yes, default confidence threshold to HIGH unless specified
          const effectiveConfidence = opts.confidence
            ? (opts.confidence as 'HIGH' | 'MEDIUM' | 'MED' | 'LOW')
            : opts.yes && opts.apply
              ? 'HIGH'
              : undefined

          const clack = isInteractiveText ? await import('@clack/prompts') : null
          if (clack) {
            clack.intro('SpecD — Suggest implementation links')
          }

          const s = clack ? clack.spinner() : null
          if (s) {
            s.start('Analyzing implementation links...')
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
              ...(effectiveConfidence !== undefined
                ? { confidenceThreshold: effectiveConfidence }
                : {}),
              ...(opts.rebuildCache !== undefined ? { rebuildCache: opts.rebuildCache } : {}),
              onProgress: (evt) => {
                if (evt.type === 'stale-warning') {
                  if (clack && s) {
                    s.stop('Code graph index is stale')
                    clack.log.warn('Code graph index is stale. Run \'specd graph index\' for the most up-to-date analysis.')
                    s.start('Analyzing codebase implementation links...')
                  } else if (fmt === 'text') {
                    output('warning: code graph index is stale. Run \'specd graph index\' to update.', 'text')
                  }
                } else if (s) {
                  if (evt.type === 'discovery-start') {
                    s.message('Discovering specifications across workspaces...')
                  } else if (evt.type === 'start') {
                    s.message(
                      `Analyzing implementation links for ${evt.totalSpecs} specification(s)...`,
                    )
                  } else if (evt.type === 'spec-start') {
                    s.message(`[${evt.index}/${evt.totalSpecs}] Analyzing ${evt.specId}...`)
                  }
                }
              },
            })
            if (s) {
              s.stop('Implementation link analysis complete')
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
              s.stop('Implementation link analysis failed', 1)
            }
            throw err
          }

          // Handle interactive apply prompting
          if (isInteractiveApply && clack) {
            const { promptSelectImplementationLinks } =
              await import('../../helpers/prompt-apply.js')

            const specsWithSuggestions = result.specs.filter((s) => s.suggestions.length > 0)

            let updatedSpecsCount = 0
            let filesAddedCount = 0
            let symbolsAddedCount = 0
            let wasCancelled = false

            for (let i = 0; i < specsWithSuggestions.length; i++) {
              const spec = specsWithSuggestions[i]!
              const hasNext = i < specsWithSuggestions.length - 1
              const selected = await promptSelectImplementationLinks(
                spec.specId,
                spec.suggestions,
                { hasNext, existingFiles: spec.existing.files },
              )

              if (selected === null) {
                clack.outro('Apply cancelled.')
                wasCancelled = true
                break
              }

              if (selected.length > 0) {
                updatedSpecsCount++
                for (const item of selected) {
                  filesAddedCount++
                  symbolsAddedCount += item.symbols.length
                  await kernel.specs.updatePersistedImplementation.execute({
                    specId: spec.specId,
                    action: 'add',
                    file: item.file,
                    ...(item.symbols.length > 0 ? { symbols: item.symbols } : {}),
                  })
                }
              }
            }

            if (wasCancelled) {
              return
            }

            if (updatedSpecsCount > 0) {
              result = {
                ...result,
                appliedMutations: {
                  updatedSpecsCount,
                  filesAddedCount,
                  symbolsAddedCount,
                },
              }
            }
          }

          if (fmt === 'text') {
            const chalk = (await import('chalk')).default
            const lines: string[] = []
            for (const spec of result.specs) {
              lines.push(`[${chalk.bold(spec.specId)}]`)
              if (spec.existing.files.length > 0) {
                lines.push('  existing:')
                for (const f of spec.existing.files) {
                  lines.push(`    ${f}`)
                }
              }
              if (spec.suggestions.length === 0) {
                lines.push('  suggestions: (none)')
              } else {
                lines.push('  suggestions:')
                for (const sug of spec.suggestions) {
                  const tag = sug.alreadyIncluded ? '[already included]' : '[new]'
                  const symsStr = sug.symbols.length > 0 ? ` [${sug.symbols.join(', ')}]` : ''
                  lines.push(`    ${tag} [${sug.confidence}] ${sug.file}${symsStr}`)
                }
              }
              lines.push('')
            }
            if (result.appliedMutations) {
              lines.push(
                `applied mutations: updated ${result.appliedMutations.updatedSpecsCount} specs (${result.appliedMutations.filesAddedCount} files, ${result.appliedMutations.symbolsAddedCount} symbols added)`,
              )
            }

            if (clack) {
              const { wrapForClack } = await import('../../helpers/prompt-apply.js')
              clack.note(wrapForClack(lines.join('\n').trim()), 'Suggested implementation links')
              if (isInteractiveApply) {
                const applied = result.appliedMutations
                clack.outro(
                  applied && applied.updatedSpecsCount > 0
                    ? `Applied ${applied.filesAddedCount} link(s) across ${applied.updatedSpecsCount} spec(s).`
                    : 'No new implementation links were applied.',
                )
              } else {
                const totalSuggestions = result.specs.reduce(
                  (acc, s) => acc + s.suggestions.length,
                  0,
                )
                clack.outro(
                  `Found ${totalSuggestions} suggestion(s) across ${result.specs.length} spec(s).`,
                )
              }
            } else {
              output('suggested implementation links:', 'text')
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
