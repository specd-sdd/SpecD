import { Command, Option } from 'commander'
import {
  type CoveringSpecImpact,
  createCodeGraphProvider,
  type FileImpactResult,
  GraphSpecNotFoundError as SpecNotFoundError,
  type SpecdConfig,
} from '@specd/sdk'
import { cliError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { warnGraphStale } from './warn-graph-staleness.js'
import {
  resolveImpactFileSelectors,
  splitWorkspaceIdentity,
  toGraphDisplayPath,
} from './resolve-impact-file-selectors.js'
import { parseGraphKinds } from './parse-graph-kinds.js'

/** Provider-supported graph impact traversal directions. */
type ImpactDirection = 'upstream' | 'downstream' | 'both'

/** Open code graph provider used by the impact command. */
type GraphImpactProvider = Awaited<ReturnType<typeof createCodeGraphProvider>>

/** Provider-owned filter payload accepted by all impact operations. */
type ImpactResultFilter = NonNullable<Parameters<GraphImpactProvider['analyzeImpact']>[3]>

/** Valid impact result categories accepted by the CLI. */
const IMPACT_RESULT_TYPES = ['files', 'symbols', 'specs'] as const

/** One supported category of graph impact result. */
type ImpactResultType = (typeof IMPACT_RESULT_TYPES)[number]

const VALID_IMPACT_RESULT_TYPES = new Set<ImpactResultType>(IMPACT_RESULT_TYPES)

/**
 * Collects a repeatable option value without changing its ordering.
 * @param value - The new option value.
 * @param previous - Previously collected option values.
 * @returns The accumulated values.
 */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

/**
 * Trims values and removes later duplicates while preserving first occurrence order.
 * @param values - Raw option values.
 * @returns Non-empty, stable-deduplicated values.
 */
function normalizeRepeatedValues(values: readonly string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const value = raw.trim()
    if (value.length === 0 || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

/**
 * Normalizes graph impact filter flags before graph context or provider access.
 * @param opts - Raw impact filter option values.
 * @param opts.type - Comma-separated impact result categories.
 * @param opts.kind - Comma-separated symbol kinds.
 * @param opts.workspace - Repeated included workspace names.
 * @param opts.excludeWorkspace - Repeated excluded workspace names.
 * @param format - Raw output format used for CLI errors.
 * @returns One provider filter, or undefined when no filter flags were supplied.
 */
function normalizeImpactResultFilter(
  opts: {
    readonly type?: string
    readonly kind?: string
    readonly workspace: readonly string[]
    readonly excludeWorkspace: readonly string[]
  },
  format: string,
): ImpactResultFilter | undefined {
  const types =
    opts.type === undefined
      ? undefined
      : normalizeRepeatedValues(opts.type.toLowerCase().split(',')).map((type) => {
          if (!VALID_IMPACT_RESULT_TYPES.has(type as ImpactResultType)) {
            cliError(
              `invalid impact type "${type}". Expected one or more of: files, symbols, specs`,
              format,
              1,
            )
          }
          return type as ImpactResultType
        })
  const kinds = (() => {
    try {
      return parseGraphKinds(opts.kind)
    } catch (err) {
      cliError(err instanceof Error ? err.message : 'invalid --kind value', format, 1)
    }
  })()
  if (kinds !== undefined && types !== undefined && !types.includes('symbols')) {
    cliError('--kind requires --type to include symbols', format, 1)
  }

  const workspaces = normalizeRepeatedValues(opts.workspace)
  const excludeWorkspaces = normalizeRepeatedValues(opts.excludeWorkspace)
  if (
    types === undefined &&
    kinds === undefined &&
    workspaces.length === 0 &&
    excludeWorkspaces.length === 0
  ) {
    return undefined
  }
  return {
    ...(types === undefined ? {} : { types }),
    ...(kinds === undefined ? {} : { kinds }),
    workspaces,
    excludeWorkspaces,
  }
}

/** Shared impact payload shape used by text formatters in this command. */
type FormattedImpactResult = {
  riskLevel: string
  directDependents: number
  indirectDependents: number
  transitiveDependents: number
  affectedFiles: readonly string[]
  affectedSymbols?: readonly { name: string; filePath: string; line: number; depth: number }[]
  affectedSpecs?: readonly string[]
}

/** Spec impact payload shape used by text formatters in this command. */
type FormattedSpecImpactResult = FormattedImpactResult & {
  affectedSpecs: readonly string[]
}

/**
 * Appends deterministic covering-spec evidence to text impact output.
 * @param coveringSpecs - Provider-derived direct and blast-radius coverage.
 * @returns Ordered text lines, or an empty list when no spec covers the impact.
 */
function formatCoveringSpecs(coveringSpecs: readonly CoveringSpecImpact[] | undefined): string[] {
  if (coveringSpecs === undefined || coveringSpecs.length === 0) return []
  const lines = ['', 'Covering specs:']
  const groups = [
    { label: 'Direct:', values: coveringSpecs.filter((item) => item.minDepth === 0) },
    { label: 'Blast radius:', values: coveringSpecs.filter((item) => item.minDepth > 0) },
  ]
  for (const group of groups) {
    if (group.values.length === 0) continue
    lines.push(`  ${group.label}`)
    for (const covering of group.values) {
      lines.push(`    ${covering.specId} (depth=${String(covering.minDepth)})`)
      for (const evidence of covering.evidence) {
        lines.push(`      ${evidence.kind} ${evidence.target} (depth=${String(evidence.depth)})`)
      }
    }
  }
  return lines
}

/**
 * Formats an impact result as text lines.
 * @param label - The label for the analysis target.
 * @param result - The impact result to format.
 * @param result.riskLevel - The overall risk level.
 * @param result.directDependents - Count of direct dependents.
 * @param result.indirectDependents - Count of indirect dependents.
 * @param result.transitiveDependents - Count of transitive dependents.
 * @param result.affectedFiles - List of affected file paths.
 * @param result.affectedSymbols - Optional list of affected symbols with name and file path.
 * @param result.affectedSpecs - Optional list of affected spec IDs.
 * @param maxDepth - Maximum traversal depth used (default: 3). Non-default values shown in header.
 * @returns An array of formatted lines.
 */
function formatImpact(label: string, result: FormattedImpactResult, maxDepth = 3): string[] {
  const depthSuffix = maxDepth !== 3 ? ` (depth=${String(maxDepth)})` : ''
  const lines = [
    `Impact analysis for ${label}${depthSuffix}`,
    `  Risk level:       ${result.riskLevel}`,
    `  Direct deps:      ${String(result.directDependents)}`,
    `  Indirect deps:    ${String(result.indirectDependents)}`,
    `  Transitive deps:  ${String(result.transitiveDependents)}`,
    `  Affected files:   ${String(result.affectedFiles.length)}`,
  ]

  if (result.affectedSpecs !== undefined && result.affectedSpecs.length > 0) {
    lines.push(`  Affected specs:   ${String(result.affectedSpecs.length)}`)
  }

  if (result.affectedSymbols && result.affectedSymbols.length > 0) {
    // Group symbols by file, preserving line and depth info for display
    const byFile = new Map<string, Array<{ name: string; line: number; depth: number }>>()
    for (const s of result.affectedSymbols) {
      const existing = byFile.get(s.filePath)
      if (existing) {
        existing.push({ name: s.name, line: s.line, depth: s.depth })
      } else {
        byFile.set(s.filePath, [{ name: s.name, line: s.line, depth: s.depth }])
      }
    }

    lines.push('')
    lines.push('Affected files:')
    for (const f of result.affectedFiles) {
      const syms = byFile.get(f)
      if (syms) {
        const symList = syms
          .map((s) => `${s.name}:${String(s.line)} (d=${String(s.depth)})`)
          .join(', ')
        lines.push(`  ${f}: ${symList}`)
      } else {
        lines.push(`  ${f}`)
      }
    }
  } else if (result.affectedFiles.length > 0) {
    lines.push('')
    lines.push('Affected files:')
    for (const f of result.affectedFiles) {
      lines.push(`  ${f}`)
    }
  }

  if (result.affectedSpecs !== undefined && result.affectedSpecs.length > 0) {
    lines.push('')
    lines.push('Affected specs:')
    for (const affectedSpec of result.affectedSpecs) {
      lines.push(`  ${affectedSpec}`)
    }
  }

  return lines
}

/**
 * Formats a spec impact result as text lines.
 *
 * @param specId - The target spec identifier.
 * @param result - The spec impact result to format.
 * @param maxDepth - Maximum traversal depth used.
 * @returns An array of formatted lines.
 */
function formatSpecImpact(
  specId: string,
  result: FormattedSpecImpactResult,
  maxDepth = 3,
): string[] {
  return formatImpact(`spec ${specId}`, result, maxDepth)
}

/**
 * Parses user-facing graph impact direction aliases into provider direction values.
 * @param raw - Raw direction option value.
 * @param format - Raw output format, used for structured CLI errors.
 * @returns The normalized provider direction.
 */
function parseImpactDirection(raw: string | undefined, format: string): ImpactDirection {
  switch (raw ?? 'dependents') {
    case 'dependents':
    case 'upstream':
      return 'upstream'
    case 'dependencies':
    case 'downstream':
      return 'downstream'
    case 'both':
      return 'both'
    default:
      cliError(
        `invalid direction "${raw}". Expected one of: dependents, dependencies, upstream, downstream, both`,
        format,
        1,
      )
  }
}

/**
 * Registers the `graph impact` command.
 * @param parent - The parent commander command.
 */
export function registerGraphImpact(parent: Command): void {
  parent
    .command('impact')
    .allowExcessArguments(false)
    .description('Analyze impact of changes to one or more files or a symbol')
    .option(
      '--file <path...>',
      'analyze impact of one or more files (workspace:path, config-relative, or absolute)',
    )
    .option('--symbol <name>', 'analyze impact of a symbol by name')
    .option('--spec <id>', 'analyze impact of a spec by identifier')
    .option('--export <name>', 'analyze one public export route')
    .option('--from <surface>', 'public surface containing --export')
    .addOption(
      new Option(
        '--direction <dir>',
        'impact direction: dependents|dependencies|upstream|downstream|both',
      ).default('dependents'),
    )
    .addOption(new Option('--type <types>', 'filter result categories: files,symbols,specs'))
    .addOption(new Option('--kind <kinds>', 'filter impacted symbols by kind (comma-separated)'))
    .option('--workspace <name>', 'include results from workspace (repeatable)', collect, [])
    .option(
      '--exclude-workspace <name>',
      'exclude results from workspace (repeatable)',
      collect,
      [],
    )
    .option('--depth <n>', 'max traversal depth (positive integer)', '3')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
File selectors:
  --file packages/core/src/model.ts          config-relative path
  --file core:src/model.ts                   workspace-prefixed canonical path
  --file /abs/path/to/packages/core/model.ts absolute path
  --file a.ts --file b.ts                    multiple files (aggregated impact)

JSON/TOON output schema:
  --symbol (single match):
    { symbol: { id, name, kind, filePath, line, column, comment }, impact: ImpactResult }
  --symbol (multiple matches):
    Array<{ symbol: { id, name, kind, filePath, line, column, comment }, impact: ImpactResult }>
  --file (single):
    FileImpactResult (ImpactResult + symbols: ImpactResult[])
  --file (multiple):
    AggregatedFileImpactResult
  --spec:
    { spec: string, impact: SpecImpactResult }
  --symbol (no match):
    { error: "not_found", symbol: string }

  ImpactResult: { target, directDependents, indirectDependents, transitiveDependents,
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", affectedFiles: string[],
    affectedSymbols: Array<{ id, name, filePath }>, affectedSpecs: string[],
    affectedProcesses: string[] }
`,
    )
    .action(
      async (opts: {
        file?: string[]
        symbol?: string
        spec?: string
        export?: string
        from?: string
        direction: string
        type?: string
        kind?: string
        workspace: string[]
        excludeWorkspace: string[]
        depth: string
        config?: string
        path?: string
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const direction = parseImpactDirection(opts.direction, opts.format)
        const maxDepth = parseInt(opts.depth, 10)
        if (Number.isNaN(maxDepth) || maxDepth <= 0) {
          cliError('--depth must be a positive integer', opts.format, 1)
        }

        if ((opts.export === undefined) !== (opts.from === undefined)) {
          cliError('--export and --from must be provided together', opts.format, 1)
        }
        const selectorCount =
          (opts.symbol ? 1 : 0) + (opts.file ? 1 : 0) + (opts.spec ? 1 : 0) + (opts.export ? 1 : 0)
        if (selectorCount !== 1) {
          cliError(
            'provide exactly one of --file, --symbol, --spec, or --export with --from',
            opts.format,
            1,
          )
        }
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }
        const filter = normalizeImpactResultFilter(opts, opts.format)

        const { config, kernel } = await resolveGraphCliContext({
          configPath: opts.config,
          repoPath: opts.path,
        }).catch((err: unknown) =>
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          ),
        )
        await withProvider(
          config,
          opts.format,
          async (provider) => {
            await warnGraphStale(provider, config, kernel)
            if (opts.export !== undefined && opts.from !== undefined) {
              await handlePublicExportImpact(
                provider,
                opts.export,
                opts.from,
                direction,
                maxDepth,
                fmt,
                filter,
              )
            } else if (opts.symbol) {
              await handleSymbolImpact(
                provider,
                opts.symbol,
                direction,
                maxDepth,
                fmt,
                config,
                filter,
              )
            } else if (opts.spec) {
              await handleSpecImpact(provider, opts.spec, direction, maxDepth, fmt, config, filter)
            } else if (opts.file) {
              await handleFilesImpact(provider, opts.file, direction, maxDepth, fmt, config, filter)
            }
          },
          { kernel },
        )
      },
    )
}

/**
 * Resolves and renders one exact public export independently from its canonical target.
 *
 * @param provider - Open code graph provider
 * @param exportedName - Public exported spelling
 * @param surface - Public surface containing the export
 * @param direction - Traversal direction
 * @param maxDepth - Maximum traversal depth
 * @param fmt - Output format
 * @param filter - Optional normalized provider-side impact filter.
 * @returns When rendering completes
 */
async function handlePublicExportImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  exportedName: string,
  surface: string,
  direction: ImpactDirection,
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  filter: ImpactResultFilter | undefined,
): Promise<void> {
  let canonicalSurface = surface
  if (!surface.includes(':')) {
    const matches = await provider.resolveFileSelector(surface)
    if (matches.length > 1) {
      cliError(
        `ambiguous public surface "${surface}": ${matches.map((match) => match.canonicalPath).join(', ')}`,
        fmt,
        1,
      )
    }
    if (matches.length === 1) canonicalSurface = matches[0]!.canonicalPath
  }
  const workspace = splitWorkspaceIdentity(canonicalSurface)?.workspace ?? 'default'
  const resolution = await provider.resolveSymbolReference({
    workspace,
    requested: exportedName,
    publicSurface: canonicalSurface,
  })

  if (resolution.status !== 'resolved' || resolution.target === null) {
    if (fmt === 'text') {
      const reason = resolution.reasonCode === null ? '' : ` (${resolution.reasonCode})`
      output(`Public export ${surface}::${exportedName}: ${resolution.status}${reason}`, 'text')
    } else {
      output({ export: exportedName, from: surface, resolution }, fmt)
    }
    return
  }

  const selected = await provider.getExactPublicBinding({
    surface: canonicalSurface,
    exportedName,
    space: resolution.target.space,
    targetId: resolution.target.id,
  })

  if (selected === null) {
    const candidates: readonly never[] = []
    if (fmt === 'text') {
      output(
        `Public export ${surface}::${exportedName}: ambiguous (${String(candidates.length)} routes)`,
        'text',
      )
    } else {
      output(
        {
          export: exportedName,
          from: surface,
          resolution: {
            ...resolution,
            status: 'ambiguous',
            reasonCode: 'AMBIGUOUS_PUBLIC_BINDING',
          },
          candidates,
        },
        fmt,
      )
    }
    return
  }

  const input = {
    binding: selected.binding,
    target: resolution.target,
    declarations: selected.declarations,
    path: resolution.path,
  }
  const result =
    filter === undefined
      ? await provider.analyzePublicBindingImpact(input, direction, maxDepth)
      : await provider.analyzePublicBindingImpact(input, direction, maxDepth, filter)

  if (fmt === 'text') {
    const lines = [
      `Public export impact for ${surface}::${exportedName}`,
      `  Binding: ${result.binding.id}`,
      `  Target:  ${result.target.id}`,
      `  Path:    ${result.path.map((step) => `${step.kind}:${step.fromId}->${step.toId}`).join(' | ') || '(direct)'}`,
      '',
      'Exact public-binding impact:',
      ...formatImpact(result.binding.id, result.bindingImpact, maxDepth).map((line) => `  ${line}`),
      '',
      'Canonical-symbol impact:',
      ...formatImpact(result.target.id, result.canonicalImpact, maxDepth).map(
        (line) => `  ${line}`,
      ),
    ]
    output(lines.join('\n'), 'text')
  } else {
    output({ export: exportedName, from: surface, resolution, ...result }, fmt)
  }
}

/**
 * Handles file-level impact analysis.
 * @param provider - The code graph provider.
 * @param rawSelectors - The file selectors to resolve and analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param config - Resolved project configuration used for pure display-path projection.
 * @param filter - Optional normalized provider-side impact filter.
 */
async function handleFilesImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  rawSelectors: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  config: SpecdConfig,
  filter: ImpactResultFilter | undefined,
): Promise<void> {
  const resolvedFiles = await resolveImpactFileSelectors(provider, rawSelectors)
  const resolved = resolvedFiles.map((file) => ({
    canonicalPath: file.path,
    configRelativePath: toGraphDisplayPath(config, file.path),
    workspace: file.workspace,
    kind: 'file' as const,
  }))
  const toDisplayPath = (canonicalPath: string): string => toGraphDisplayPath(config, canonicalPath)

  if (resolved.length === 1) {
    const file = resolved[0]!
    const result =
      filter === undefined
        ? await provider.analyzeFileImpact(file.canonicalPath, direction, maxDepth)
        : await provider.analyzeFileImpact(file.canonicalPath, direction, maxDepth, filter)
    const displayResult = {
      ...result,
      affectedFiles: result.affectedFiles.map((path) => toDisplayPath(path)),
      affectedSymbols: result.affectedSymbols
        ? result.affectedSymbols.map((symbol) => ({
            ...symbol,
            filePath: toDisplayPath(symbol.filePath),
          }))
        : result.affectedSymbols,
    }

    if (fmt === 'text') {
      const lines = formatImpact(file.configRelativePath, displayResult, maxDepth)

      if (result.symbols.length > 0) {
        lines.push('')
        lines.push('Changed symbols:')
        for (const s of result.symbols) {
          const segments = s.target.split(':')
          const nameIdx = segments.length >= 4 ? segments.length - 3 : -1
          const lineIdx = segments.length >= 2 ? segments.length - 2 : -1
          const name = nameIdx >= 0 ? segments[nameIdx] : s.target
          const line = lineIdx >= 0 ? segments[lineIdx] : ''
          lines.push(`  ${name}:${line}`)
        }
      }

      if (result.symbols.length > 0) {
        lines.push('')
        lines.push('Per-symbol breakdown:')
        for (const s of result.symbols) {
          lines.push(`  ${s.target}  risk=${s.riskLevel} direct=${String(s.directDependents)}`)
        }
      }
      lines.push(...formatCoveringSpecs(result.coveringSpecs))
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          ...displayResult,
          canonicalPath: file.canonicalPath,
          displayPath: file.configRelativePath,
          riskLevel: result.riskLevel,
          directDepsCount: result.directDependents,
          indirectDepsCount: result.indirectDependents,
          transitiveDepsCount: result.transitiveDependents,
          affectedFilesCount: result.affectedFiles.length,
        },
        fmt,
      )
    }
    return
  }

  const filePaths = resolved.map((file) => file.canonicalPath)
  const result =
    filter === undefined
      ? await provider.analyzeFilesImpact(filePaths, direction, maxDepth)
      : await provider.analyzeFilesImpact(filePaths, direction, maxDepth, filter)

  const individualResults = result.symbols as unknown as FileImpactResult[]
  const perFile = resolved.map((f, i) => ({
    file: f,
    result: individualResults[i]!,
  }))

  if (fmt === 'text') {
    const label =
      resolved.length <= 3
        ? resolved.map((f) => f.configRelativePath).join(', ')
        : `${String(resolved.length)} files`
    const lines = formatImpact(
      label,
      {
        riskLevel: result.riskLevel,
        directDependents: result.directDependents,
        indirectDependents: result.indirectDependents,
        transitiveDependents: result.transitiveDependents,
        affectedFiles: result.affectedFiles,
      },
      maxDepth,
    )

    const allChangedSymbols = perFile.flatMap(({ file, result: r }) =>
      r.symbols.map((s) => ({ file: file.configRelativePath, symbol: s })),
    )
    if (allChangedSymbols.length > 0) {
      lines.push('')
      lines.push('Changed symbols:')
      for (const { file, symbol: s } of allChangedSymbols) {
        const segments = s.target.split(':')
        const nameIdx = segments.length >= 4 ? segments.length - 3 : -1
        const lineIdx = segments.length >= 2 ? segments.length - 2 : -1
        const name = nameIdx >= 0 ? segments[nameIdx] : s.target
        const line = lineIdx >= 0 ? segments[lineIdx] : ''
        lines.push(`  ${file}: ${name}:${line}`)
      }
    }

    lines.push('')
    lines.push('Per-file breakdown:')
    for (const { file, result: r } of perFile) {
      lines.push(
        `  ${file.configRelativePath}  risk=${r.riskLevel} direct=${String(r.directDependents)} files=${String(r.affectedFiles.length)}`,
      )
    }
    lines.push(...formatCoveringSpecs(result.coveringSpecs))
    output(lines.join('\n'), 'text')
  } else {
    output(
      {
        targets: resolved.map((f) => f.canonicalPath),
        displayTargets: resolved.map((f) => f.configRelativePath),
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        // Legacy fields for backward compatibility
        directDependents: result.directDependents,
        indirectDependents: result.indirectDependents,
        transitiveDependents: result.transitiveDependents,
        affectedFiles: result.affectedFiles.map((path) => toDisplayPath(path)),
        coveringSpecs: result.coveringSpecs,
        perFile: perFile.map(({ file, result: r }) => ({
          file: file.canonicalPath,
          displayPath: file.configRelativePath,
          result: {
            ...r,
            affectedFiles: r.affectedFiles.map((path) => toDisplayPath(path)),
          },
        })),
      },
      fmt,
    )
  }
}

/**
 * Handles symbol-level impact analysis.
 * @param provider - The code graph provider.
 * @param symbolSelector - The symbol selector to resolve and analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param config - Resolved project configuration used for pure display-path projection.
 * @param filter - Optional normalized provider-side impact filter.
 */
async function handleSymbolImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  symbolSelector: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  config: SpecdConfig,
  filter: ImpactResultFilter | undefined,
): Promise<void> {
  const toDisplayPath = (canonicalPath: string): string => toGraphDisplayPath(config, canonicalPath)
  const resolved = await provider.resolveSymbolSelector(symbolSelector)
  if (resolved.status === 'missing') {
    if (fmt === 'text') {
      output(`No symbol found matching "${symbolSelector}".`, 'text')
    } else {
      output({ error: 'not_found', symbol: symbolSelector }, fmt)
    }
    return
  }

  if (resolved.status === 'ambiguous') {
    const foundById = new Map(
      (
        await provider.getSymbolsByIds(resolved.candidates.map((candidate) => candidate.symbolId))
      ).map((symbol) => [symbol.id, symbol]),
    )
    const candidates = resolved.candidates.map((candidate) => {
      const symbol = foundById.get(candidate.symbolId)
      return symbol === undefined ? null : { symbol, displayPath: toDisplayPath(symbol.filePath) }
    })
    const present = candidates.filter((candidate) => candidate !== null)
    if (fmt === 'text') {
      const lines = [
        `${String(resolved.totalCandidates)} symbols exactly match "${symbolSelector}"; qualify the selector:`,
      ]
      for (const { symbol, displayPath } of present) {
        lines.push(
          `  ${displayPath}:${symbol.kind}:${symbol.name}:${String(symbol.line)}:${String(symbol.column)}`,
        )
      }
      if (resolved.totalCandidates > present.length) {
        lines.push(`  ${String(resolved.totalCandidates - present.length)} more candidates`)
      }
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          error: 'ambiguous',
          symbol: symbolSelector,
          totalCandidates: resolved.totalCandidates,
          candidates: present,
        },
        fmt,
      )
    }
    return
  }

  const sym = await provider.getSymbol(resolved.match.symbolId)

  if (sym === undefined) {
    if (fmt === 'text') {
      output(`No symbol found matching "${symbolSelector}".`, 'text')
    } else {
      output({ error: 'not_found', symbol: symbolSelector }, fmt)
    }
    return
  }

  const result =
    filter === undefined
      ? await provider.analyzeImpact(sym.id, direction, maxDepth)
      : await provider.analyzeImpact(sym.id, direction, maxDepth, filter)
  const displayPath = toDisplayPath(sym.filePath)
  const displayResult = {
    ...result,
    affectedFiles: result.affectedFiles.map((path) => toDisplayPath(path)),
    affectedSymbols: result.affectedSymbols.map((symbol) => ({
      ...symbol,
      filePath: toDisplayPath(symbol.filePath),
    })),
  }

  if (fmt === 'text') {
    const lines = formatImpact(
      `${sym.kind} ${sym.name} (${displayPath}:${String(sym.line)})`,
      displayResult,
      maxDepth,
    )
    output(lines.join('\n'), 'text')
  } else {
    output(
      {
        symbol: sym,
        displayPath,
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        impact: displayResult,
      },
      fmt,
    )
  }
}

/**
 * Handles spec-level impact analysis.
 * @param provider - The code graph provider.
 * @param specId - The spec identifier to analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param config - Resolved project configuration used for pure display-path projection.
 * @param filter - Optional normalized provider-side impact filter.
 */
async function handleSpecImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  config: SpecdConfig,
  filter: ImpactResultFilter | undefined,
): Promise<void> {
  const spec = await provider.getSpec(specId)
  if (spec === undefined) {
    throw new SpecNotFoundError(specId)
  }

  const result =
    filter === undefined
      ? await provider.analyzeSpecImpact(specId, direction, maxDepth)
      : await provider.analyzeSpecImpact(specId, direction, maxDepth, filter)
  const toDisplayPath = (canonicalPath: string): string => toGraphDisplayPath(config, canonicalPath)
  const displayResult = {
    ...result,
    affectedFiles: result.affectedFiles.map((path) => toDisplayPath(path)),
    affectedSymbols: result.affectedSymbols.map((sym) => ({
      ...sym,
      filePath: toDisplayPath(sym.filePath),
    })),
  }
  if (fmt === 'text') {
    output(formatSpecImpact(spec.specId, displayResult, maxDepth).join('\n'), 'text')
  } else {
    output(
      {
        spec: spec.specId,
        riskLevel: result.riskLevel,
        directDepsCount: result.directDependents,
        indirectDepsCount: result.indirectDependents,
        transitiveDepsCount: result.transitiveDependents,
        affectedFilesCount: result.affectedFiles.length,
        impact: displayResult,
      },
      fmt,
    )
  }
}
