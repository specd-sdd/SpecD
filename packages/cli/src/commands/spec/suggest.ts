import { type Command } from 'commander'
import { openSuggestSpecs, type SuggestSpecsResult, type CandidateSpec } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { collect } from '../../helpers/collect.js'

/**
 * Builds human-readable text lines for suggested specs matching CLI conventions.
 *
 * @param result - SuggestSpecsResult returned by SDK
 * @param chalk - Optional chalk instance for formatting
 * @param isGapAnalysis - Whether the execution is auditing gaps vs pure brownfield discovery
 * @returns Human-readable text lines describing the suggested specs
 */
function buildSuggestSpecsTextLines(
  result: SuggestSpecsResult,
  chalk?: typeof import('chalk').default,
  isGapAnalysis = false,
): string[] {
  const summary = result.summary
  const lines: string[] = []

  lines.push(
    `coverage: ${summary.codeCoveragePercentage}% | files: ${summary.totalFilesAnalyzed} | symbols: ${summary.totalSymbolsAnalyzed} | workspaces: ${summary.totalWorkspaces}`,
  )
  const metricLabel = isGapAnalysis ? 'gaps' : 'suggested'
  const entityNoun = isGapAnalysis ? 'gap(s)' : 'spec(s)'
  lines.push(
    `${metricLabel}: ${summary.totalSpecsSuggested} ${entityNoun} (${summary.highConfidenceSpecsCount} high confidence >= 80%) | avg confidence: ${(summary.averageConfidence * 100).toFixed(0)}%`,
  )
  lines.push('')

  if (result.suggestedSpecs.length === 0) {
    lines.push(
      isGapAnalysis
        ? 'no specification gaps found matching the criteria.'
        : 'no candidate specifications found matching the criteria.',
    )
    return lines
  }

  for (let i = 0; i < result.suggestedSpecs.length; i++) {
    const spec = result.suggestedSpecs[i] as CandidateSpec
    const confidencePct = `${(spec.confidence * 100).toFixed(0)}%`
    const specHeader = chalk ? chalk.bold(spec.id) : spec.id
    lines.push(`[${specHeader}] [${confidencePct}] [${spec.priority}]`)
    lines.push(`  title:       ${spec.title}`)
    lines.push(`  workspace:   ${spec.workspace} | category: ${spec.category}`)
    lines.push(`  rationale:   ${spec.rationale.whyNeeded}`)

    if (spec.anchorSymbols.length > 0) {
      const symbolsStr = spec.anchorSymbols.map((s) => `${s.name} (${s.kind})`).join(', ')
      lines.push(`  key symbols: ${symbolsStr}`)
    }

    if (spec.primaryFiles.length > 0) {
      lines.push(`  primary files:`)
      for (const f of spec.primaryFiles) {
        lines.push(`    - ${f}`)
      }
    }

    if (spec.dependsOnSpecs.length > 0) {
      lines.push(`  suggested dependsOn: ${spec.dependsOnSpecs.join(', ')}`)
    }

    lines.push('')
  }

  return lines
}

/**
 * Registers the `spec suggest` (and `specs suggest`) command.
 *
 * @param parent - Parent commander command
 */
export function registerSpecSuggest(parent: Command): void {
  parent
    .command('suggest')
    .description('Discover candidate specifications and detect coverage gaps in codebase.')
    .option(
      '--ignore-current-specs',
      'Ignore existing specs on disk and execute full brownfield capability discovery',
    )
    .option(
      '-w, --workspace <name>',
      'Filter specification suggestion to specific workspace(s) (repeatable or comma-separated)',
      collect,
      [],
    )
    .option(
      '-m, --min-confidence <number>',
      'Filter by minimum confidence threshold (0.0 - 1.0)',
      parseFloat,
    )
    .option('-l, --limit <number>', 'Limit the number of displayed candidate specifications', (v) =>
      parseInt(v, 10),
    )
    .option('--rebuild-cache', 'Bypass and overwrite existing suggestion cache entries')
    .option('--config <path>', 'path to specd.yaml')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('-j, --json', 'output machine-readable JSON (shorthand for --format json)')
    .action(
      async (opts: {
        ignoreCurrentSpecs?: boolean
        workspace?: string[]
        minConfidence?: number
        limit?: number
        rebuildCache?: boolean
        config?: string
        format: string
        json?: boolean
      }) => {
        try {
          const { config } = await resolveCliContext({ configPath: opts.config })
          const useCase = openSuggestSpecs(config)
          const effectiveFormat = opts.json ? 'json' : parseFormat(opts.format)

          const isInteractiveText =
            effectiveFormat === 'text' && Boolean(process.stderr?.isTTY || process.stdout?.isTTY)

          const clack = isInteractiveText ? await import('@clack/prompts') : null
          if (clack) {
            clack.intro(
              opts.ignoreCurrentSpecs
                ? 'SpecD — Suggest specifications'
                : 'SpecD — Audit specification gaps',
            )
          }

          const s = clack ? clack.spinner() : null
          if (s) {
            s.start(
              opts.ignoreCurrentSpecs
                ? 'Analyzing codebase capabilities and discovering specifications...'
                : 'Auditing codebase capabilities and specification coverage...',
            )
          }

          let result: SuggestSpecsResult
          try {
            const effectiveWorkspaces =
              opts.workspace && opts.workspace.length > 0
                ? opts.workspace.length === 1
                  ? opts.workspace[0]
                  : opts.workspace
                : undefined
            result = await useCase.execute({
              ...(effectiveWorkspaces ? { workspaceFilter: effectiveWorkspaces } : {}),
              ...(opts.ignoreCurrentSpecs !== undefined
                ? { ignoreCurrentSpecs: opts.ignoreCurrentSpecs }
                : {}),
              ...(opts.minConfidence !== undefined ? { minConfidence: opts.minConfidence } : {}),
              ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
              ...(opts.rebuildCache !== undefined ? { rebuildCache: opts.rebuildCache } : {}),
              onProgress: (evt) => {
                if (evt.type === 'stale-warning') {
                  if (clack && s) {
                    s.stop('Code graph index is stale')
                    clack.log.warn(
                      "Code graph index is stale. Run 'specd graph index' for the most up-to-date analysis.",
                    )
                    s.start(
                      opts.ignoreCurrentSpecs
                        ? 'Analyzing codebase capabilities and discovering specifications...'
                        : 'Auditing codebase capabilities and specification coverage...',
                    )
                  } else if (effectiveFormat === 'text') {
                    output(
                      "warning: code graph index is stale. Run 'specd graph index' to update.",
                      'text',
                    )
                  }
                } else if (s) {
                  if (evt.type === 'warmup-start') {
                    s.message('Warming up implementation cache across workspaces...')
                  } else if (
                    evt.type === 'warmup-progress' &&
                    evt.event.type === 'discovery-start'
                  ) {
                    s.message('Discovering specifications across workspaces...')
                  } else if (evt.type === 'warmup-progress' && evt.event.type === 'spec-start') {
                    s.message(
                      `[${evt.event.index}/${evt.event.totalSpecs}] Warming cache: ${evt.event.specId}...`,
                    )
                  } else if (evt.type === 'warmup-progress' && evt.event.type === 'spec-error') {
                    if (clack) {
                      clack.log.warn(
                        `Warning: Failed analyzing spec ${evt.event.specId}: ${evt.event.error}`,
                      )
                    } else if (effectiveFormat === 'text') {
                      output(
                        `warning: failed analyzing spec ${evt.event.specId}: ${evt.event.error}`,
                        'text',
                      )
                    }
                  } else if (evt.type === 'start') {
                    s.message('Initializing capability discovery...')
                  } else if (evt.type === 'gap-audit-start') {
                    s.message(
                      `Auditing existing specifications across ${evt.totalSpecs} workspace(s)...`,
                    )
                  } else if (evt.type === 'clustering-start') {
                    s.message(`Clustering ${evt.totalFiles} source files into capabilities...`)
                  } else if (evt.type === 'done') {
                    s.message(
                      `Synthesized ${evt.totalSpecsSuggested} candidate specification(s)...`,
                    )
                  }
                } else if (evt.type === 'warmup-progress' && evt.event.type === 'spec-error') {
                  if (clack) {
                    clack.log.warn(
                      `Warning: Failed analyzing spec ${evt.event.specId}: ${evt.event.error}`,
                    )
                  } else if (effectiveFormat === 'text') {
                    output(
                      `warning: failed analyzing spec ${evt.event.specId}: ${evt.event.error}`,
                      'text',
                    )
                  }
                }
              },
            })
            if (s) {
              s.stop('Specification analysis complete')
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
              s.stop('Specification analysis failed', 1)
            }
            throw err
          }

          const isGapAnalysis =
            !opts.ignoreCurrentSpecs && (result.summary.existingSpecsCount ?? 0) > 0

          if (effectiveFormat === 'text') {
            const chalk = (await import('chalk')).default
            const lines = buildSuggestSpecsTextLines(result, chalk, isGapAnalysis)

            if (clack) {
              const { wrapForClack } = await import('../../helpers/prompt-apply.js')
              clack.note(
                wrapForClack(lines.join('\n').trim()),
                isGapAnalysis ? 'Specification gaps' : 'Suggested specifications',
              )
              const scopeText = result.targetWorkspace
                ? `workspace '${result.targetWorkspace}'`
                : `${result.summary.totalWorkspaces} workspace(s)`
              const summaryNoun = isGapAnalysis
                ? 'specification gap(s)'
                : 'candidate specification(s)'
              clack.outro(
                `Found ${result.summary.totalSpecsSuggested} ${summaryNoun} in ${scopeText}.`,
              )
            } else {
              output(isGapAnalysis ? 'specification gaps:' : 'suggested specifications:', 'text')
              for (const line of lines) {
                if (line) output(`  ${line}`, 'text')
              }
            }
          } else {
            output(result, effectiveFormat)
          }
        } catch (err) {
          handleError(err, opts.json ? 'json' : opts.format)
        }
      },
    )
}
