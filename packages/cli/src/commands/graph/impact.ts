import { Command, Option } from 'commander'
import {
  type CoveringSpecImpact,
  createCodeGraphProvider,
  type FileCategory,
  runGraphImpact,
  createSdkContext,
  type SdkHostContext,
} from '@specd/sdk'
import { cliError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { buildCliKernelOptions } from '../../helpers/cli-context.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { warnGraphStale } from './warn-graph-staleness.js'
import { formatOmissionNotice } from './format-omission-notice.js'
import { parseGraphKinds } from './parse-graph-kinds.js'
import { parseFileCategories } from './parse-file-categories.js'

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
 * @param opts.category - Category filter constraint.
 * @param opts.includeTests - Whether to include test category files.
 * @param opts.includeIgnored - Whether to include ignored category files.
 * @param opts.all - Whether to include all categories.
 * @param format - Raw output format used for CLI errors.
 * @returns One provider filter, or undefined when no filter flags were supplied.
 */
function normalizeImpactResultFilter(
  opts: {
    readonly type?: string
    readonly kind?: string
    readonly workspace: readonly string[]
    readonly excludeWorkspace: readonly string[]
    readonly category?: string
    readonly includeTests?: boolean
    readonly includeIgnored?: boolean
    readonly all?: boolean
  },
  format: string,
): ImpactResultFilter | undefined {
  const parsedCategories = parseFileCategories(opts.category, format)

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

  let categories: readonly FileCategory[] | undefined = undefined
  let includeTests: boolean | undefined = undefined
  let includeIgnored: boolean | undefined = undefined

  if (opts.all) {
    categories = ['source', 'test', 'ignored']
    includeTests = true
    includeIgnored = true
  } else {
    if (parsedCategories !== undefined) {
      categories = parsedCategories
    }
    if (opts.includeTests) {
      includeTests = true
    }
    if (opts.includeIgnored) {
      includeIgnored = true
    }
  }

  if (
    types === undefined &&
    kinds === undefined &&
    workspaces.length === 0 &&
    excludeWorkspaces.length === 0 &&
    categories === undefined &&
    includeTests === undefined &&
    includeIgnored === undefined
  ) {
    return undefined
  }
  return {
    ...(types === undefined ? {} : { types }),
    ...(kinds === undefined ? {} : { kinds }),
    ...(categories === undefined ? {} : { categories }),
    ...(includeTests === undefined ? {} : { includeTests }),
    ...(includeIgnored === undefined ? {} : { includeIgnored }),
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
  affectedSpecs?: readonly string[] | undefined
}

/** Spec impact payload shape used by text formatters in this command. */
type FormattedSpecImpactResult = FormattedImpactResult & {
  affectedSpecs?: readonly string[] | undefined
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
    .option('--include-tests', 'include test category files and symbols')
    .option('--include-ignored', 'include ignored category files and symbols')
    .option('--all', 'include all categories (source, test, ignored)')
    .option(
      '--category <categories>',
      'restrict admitted categories strictly to source|test|ignored (comma-separated)',
    )
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
    { kind: "symbol", status: "resolved", targetKind, resolvedTarget, declarations, semanticCounts, symbol: { id, name, kind, filePath, line, column, comment }, projectRelativePath: string, riskLevel, directDepsCount, indirectDepsCount, transitiveDepsCount, affectedFilesCount, omittedCounts, impact: ImpactResult }
  --symbol (multiple matches):
    { kind: "symbol", status: "ambiguous", error: "ambiguous", symbol: string, totalCandidates: number, candidates: Array<{ symbol, projectRelativePath: string }> }
  --symbol (graph cannot decide, e.g. stale or partial coverage):
    { kind: "symbol", status: "unresolved", error: "unresolved", symbol: string, reasonCode: string }
  --file (single):
    { canonicalPath: string, projectRelativePath: string, riskLevel, directDepsCount, indirectDepsCount, transitiveDepsCount, affectedFilesCount, directDependents, indirectDependents, transitiveDependents, affectedFiles: string[], affectedSymbols: Array<{ id, name, filePath, depth }>, symbols: any[], coveringSpecs: any[], omittedCounts }
  --file (multiple):
    { targets: string[], projectRelativeTargets: string[], riskLevel, directDepsCount, indirectDepsCount, transitiveDepsCount, affectedFilesCount, omittedCounts, directDependents, indirectDependents, transitiveDependents, affectedFiles: string[], coveringSpecs: any[], perFile: Array<{ file: string, projectRelativePath: string, result }> }
  --spec:
    { spec: string, riskLevel, directDepsCount, indirectDepsCount, transitiveDepsCount, affectedFilesCount, omittedCounts, impact: SpecImpactResult }
  --symbol (no match):
    { kind: "symbol", status: "not_found", error: "not_found", symbol: string }

  Count units:
    directDepsCount / indirectDepsCount / transitiveDepsCount count distinct dependents per depth
      (logical targets for --symbol, files for --file); overloads of one logical target count once.
    affectedFilesCount counts files. semanticCounts.physicalDeclarationOccurrences counts
      physical declarations, so it can exceed the logical-target counts.

  ImpactResult: { target, directDependents, indirectDependents, transitiveDependents,
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", affectedFiles: string[],
    affectedSymbols: Array<{ id, name, filePath, depth }>, affectedSpecs: string[],
    affectedProcesses: string[], omittedCounts: { tests: number, ignored: number } }
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
        includeTests?: boolean
        includeIgnored?: boolean
        all?: boolean
        category?: string
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
        const hostContext: SdkHostContext =
          kernel !== null
            ? { kernel, createGraphProvider: () => createCodeGraphProvider(config) }
            : await createSdkContext(config, { kernel: buildCliKernelOptions() })

        await withProvider(
          config,
          opts.format,
          async (provider) => {
            await warnGraphStale(provider, config, kernel)
            if (opts.export !== undefined && opts.from !== undefined) {
              await handlePublicExportImpact(
                hostContext,
                opts.export,
                opts.from,
                direction,
                maxDepth,
                fmt,
                filter,
                provider,
              )
            } else if (opts.symbol) {
              await handleSymbolImpact(
                hostContext,
                opts.symbol,
                direction,
                maxDepth,
                fmt,
                filter,
                provider,
              )
            } else if (opts.spec) {
              await handleSpecImpact(
                hostContext,
                opts.spec,
                direction,
                maxDepth,
                fmt,
                filter,
                provider,
              )
            } else if (opts.file) {
              await handleFilesImpact(
                hostContext,
                opts.file,
                direction,
                maxDepth,
                fmt,
                filter,
                provider,
              )
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
 * @param hostContext - Active SDK host context
 * @param exportedName - Public exported spelling
 * @param surface - Public surface containing the export
 * @param direction - Traversal direction
 * @param maxDepth - Maximum traversal depth
 * @param fmt - Output format
 * @param filter - Optional normalized provider-side impact filter.
 * @param provider - Optional open code graph provider
 * @returns When rendering completes
 */
async function handlePublicExportImpact(
  hostContext: SdkHostContext,
  exportedName: string,
  surface: string,
  direction: ImpactDirection,
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  filter: ImpactResultFilter | undefined,
  provider?: GraphImpactProvider,
): Promise<void> {
  const result = await runGraphImpact(hostContext, {
    export: exportedName,
    from: surface,
    direction,
    depth: maxDepth,
    ...(filter !== undefined ? { filter } : {}),
    ...(provider !== undefined ? { provider } : {}),
  })

  if (result.kind === 'export') {
    if (result.status !== 'resolved') {
      if (result.status === 'ambiguous') {
        const candidates = result.candidates ?? []
        if (fmt === 'text') {
          const lines = candidates.flatMap((candidate) => [
            `  - ${candidate.target.id}`,
            ...candidate.declarations.map(
              (declaration) =>
                `      ${declaration.projectRelativePath}:${String(declaration.location.line)}`,
            ),
          ])
          output(
            [
              `Public export ${surface}::${exportedName}: ambiguous (${String(candidates.length)} routes)`,
              ...lines,
            ].join('\n'),
            'text',
          )
        } else {
          output(
            {
              export: exportedName,
              from: surface,
              resolution: result.resolution,
              candidates,
            },
            fmt,
          )
        }
        return
      }

      if (fmt === 'text') {
        const reason =
          result.resolution.reasonCode === null ? '' : ` (${result.resolution.reasonCode})`
        output(
          `Public export ${surface}::${exportedName}: ${result.resolution.status}${reason}`,
          'text',
        )
      } else {
        output({ export: exportedName, from: surface, resolution: result.resolution }, fmt)
      }
      return
    }

    if (fmt === 'text') {
      const lines = [
        `Public export impact for ${surface}::${exportedName}`,
        `  Binding: ${result.binding.id}`,
        `  Target:  ${result.target.id}`,
        `  Path:    ${result.path.map((step) => `${step.kind}:${step.fromId}->${step.toId}`).join(' | ') || '(direct)'}`,
        '',
        'Exact public-binding impact:',
        ...formatImpact(result.binding.id, result.bindingImpact, maxDepth).map(
          (line) => `  ${line}`,
        ),
        '',
        'Canonical-symbol impact:',
        ...formatImpact(result.target.id, result.canonicalImpact, maxDepth).map(
          (line) => `  ${line}`,
        ),
      ]
      lines.push(...formatCoveringSpecs(result.coveringSpecs))
      const omissionNotice =
        formatOmissionNotice(result.canonicalImpact.omittedCounts) ??
        formatOmissionNotice(result.bindingImpact.omittedCounts)
      if (omissionNotice !== undefined) {
        lines.push('')
        lines.push(omissionNotice)
      }
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          export: result.export,
          from: result.from,
          projectRelativeSurface: result.projectRelativeSurface,
          resolution: result.resolution,
          binding: result.binding,
          target: result.target,
          path: result.path,
          bindingImpact: result.bindingImpact,
          canonicalImpact: result.canonicalImpact,
          coveringSpecs: result.coveringSpecs,
          omittedCounts: result.omittedCounts,
        },
        fmt,
      )
    }
  }
}

/**
 * Handles file-level impact analysis.
 * @param hostContext - The SDK host context.
 * @param rawSelectors - The file selectors to resolve and analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param filter - Optional normalized provider-side impact filter.
 * @param provider - The code graph provider.
 */
async function handleFilesImpact(
  hostContext: SdkHostContext,
  rawSelectors: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  filter: ImpactResultFilter | undefined,
  provider: GraphImpactProvider,
): Promise<void> {
  const result = await runGraphImpact(hostContext, {
    files: rawSelectors,
    direction,
    depth: maxDepth,
    ...(filter !== undefined ? { filter } : {}),
    provider,
  })

  if (result.kind === 'file') {
    if (fmt === 'text') {
      const lines = formatImpact(result.projectRelativePath, result, maxDepth)

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
      const omissionNotice = formatOmissionNotice(result.omittedCounts)
      if (omissionNotice !== undefined) {
        lines.push('')
        lines.push(omissionNotice)
      }
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          canonicalPath: result.canonicalPath,
          projectRelativePath: result.projectRelativePath,
          riskLevel: result.riskLevel,
          directDepsCount: result.directDepsCount,
          indirectDepsCount: result.indirectDepsCount,
          transitiveDepsCount: result.transitiveDepsCount,
          affectedFilesCount: result.affectedFilesCount,
          directDependents: result.directDependents,
          indirectDependents: result.indirectDependents,
          transitiveDependents: result.transitiveDependents,
          affectedFiles: result.affectedFiles,
          affectedSymbols: result.affectedSymbols,
          symbols: result.symbols,
          coveringSpecs: result.coveringSpecs,
          omittedCounts: result.omittedCounts,
        },
        fmt,
      )
    }
    return
  }

  if (result.kind === 'files') {
    if (fmt === 'text') {
      const label =
        result.projectRelativeTargets.length <= 3
          ? result.projectRelativeTargets.join(', ')
          : `${String(result.projectRelativeTargets.length)} files`
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

      const allChangedSymbols = result.perFile.flatMap(({ projectRelativePath, result: r }) =>
        r.symbols.map((s) => ({ file: projectRelativePath, symbol: s })),
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
      for (const { projectRelativePath, result: r } of result.perFile) {
        lines.push(
          `  ${projectRelativePath}  risk=${r.riskLevel} direct=${String(r.directDependents)} files=${String(r.affectedFiles.length)}`,
        )
      }
      lines.push(...formatCoveringSpecs(result.coveringSpecs))
      const omissionNotice = formatOmissionNotice(result.omittedCounts)
      if (omissionNotice !== undefined) {
        lines.push('')
        lines.push(omissionNotice)
      }
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          targets: result.targets,
          projectRelativeTargets: result.projectRelativeTargets,
          riskLevel: result.riskLevel,
          directDepsCount: result.directDepsCount,
          indirectDepsCount: result.indirectDepsCount,
          transitiveDepsCount: result.transitiveDepsCount,
          affectedFilesCount: result.affectedFilesCount,
          omittedCounts: result.omittedCounts,
          directDependents: result.directDependents,
          indirectDependents: result.indirectDependents,
          transitiveDependents: result.transitiveDependents,
          affectedFiles: result.affectedFiles,
          coveringSpecs: result.coveringSpecs,
          perFile: result.perFile.map(({ file, projectRelativePath, result: r }) => ({
            file,
            projectRelativePath,
            result: r,
          })),
        },
        fmt,
      )
    }
  }
}

/**
 * Handles symbol-level impact analysis.
 * @param hostContext - The SDK host context.
 * @param symbolSelector - The symbol selector to resolve and analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param filter - Optional normalized provider-side impact filter.
 * @param provider - The code graph provider.
 */
async function handleSymbolImpact(
  hostContext: SdkHostContext,
  symbolSelector: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  filter: ImpactResultFilter | undefined,
  provider: GraphImpactProvider,
): Promise<void> {
  const result = await runGraphImpact(hostContext, {
    symbol: symbolSelector,
    direction,
    depth: maxDepth,
    ...(filter !== undefined ? { filter } : {}),
    provider,
  })

  if (result.kind === 'symbol') {
    if (result.status === 'not_found') {
      if (fmt === 'text') {
        output(`No symbol found matching "${symbolSelector}".`, 'text')
      } else {
        output(
          { kind: 'symbol', status: 'not_found', error: 'not_found', symbol: symbolSelector },
          fmt,
        )
      }
      return
    }

    if (result.status === 'unresolved') {
      if (fmt === 'text') {
        output(
          `Cannot decide "${symbolSelector}": the graph evidence is not sufficient (${result.reasonCode}). Re-run \`specd graph index\` and try again.`,
          'text',
        )
      } else {
        output(
          {
            kind: 'symbol',
            status: 'unresolved',
            error: 'unresolved',
            symbol: symbolSelector,
            reasonCode: result.reasonCode,
          },
          fmt,
        )
      }
      return
    }

    if (result.status === 'ambiguous') {
      if (fmt === 'text') {
        const lines = [
          `${String(result.totalCandidates)} symbols exactly match "${symbolSelector}"; qualify the selector:`,
        ]
        for (const { symbol, projectRelativePath } of result.candidates) {
          lines.push(
            `  ${projectRelativePath}:${symbol.kind}:${symbol.name}:${String(symbol.line)}:${String(symbol.column)}`,
          )
        }
        if (result.totalCandidates > result.candidates.length) {
          lines.push(
            `  ${String(result.totalCandidates - result.candidates.length)} more candidates`,
          )
        }
        output(lines.join('\n'), 'text')
      } else {
        output(
          {
            kind: 'symbol',
            status: 'ambiguous',
            error: 'ambiguous',
            symbol: symbolSelector,
            totalCandidates: result.totalCandidates,
            candidates: result.candidates,
          },
          fmt,
        )
      }
      return
    }

    if (result.status === 'resolved') {
      if (fmt === 'text') {
        const isLogical = result.targetKind === 'logical-target'
        const label = isLogical
          ? `logical symbol ${result.logicalSymbol?.name ?? result.symbol.name} (${result.logicalSymbol?.id ?? result.symbol.name})`
          : `${result.symbol.kind} ${result.symbol.name} (${result.projectRelativePath}:${String(result.symbol.line)})`

        const lines = formatImpact(label, result.impact, maxDepth)

        const targetKindLabel =
          result.targetKind === 'logical-target'
            ? 'logical impact'
            : result.targetKind === 'declaration'
              ? 'declaration impact'
              : 'public binding impact'
        lines.splice(1, 0, `  Target kind:      ${targetKindLabel}`)

        if (result.semanticCounts !== undefined) {
          lines.push('')
          lines.push('Semantic counts:')
          lines.push(
            `  Logical targets:   ${String(result.semanticCounts.directLogicalTargets + result.semanticCounts.indirectLogicalTargets + result.semanticCounts.transitiveLogicalTargets)} (direct=${String(result.semanticCounts.directLogicalTargets)}, indirect=${String(result.semanticCounts.indirectLogicalTargets)}, transitive=${String(result.semanticCounts.transitiveLogicalTargets)})`,
          )
          lines.push(`  Physical only:     ${String(result.semanticCounts.physicalOnlyTargets)}`)
          lines.push(
            `  Physical decls:    ${String(result.semanticCounts.physicalDeclarationOccurrences)}`,
          )
        }

        if (result.declarations && result.declarations.length > 0) {
          lines.push('')
          lines.push('Declarations:')
          for (const decl of result.declarations) {
            const loc = decl.location
            const locStr = `${decl.projectRelativePath}:${String(loc.line)}:${String(loc.column)}`
            const formStr = decl.form ? ` [${decl.form}]` : ''
            lines.push(`  ${decl.kind} ${locStr}${formStr}`)
          }
        }

        if (result.semanticAffectedTargets && result.semanticAffectedTargets.length > 0) {
          lines.push('')
          lines.push('Semantic affected targets:')
          for (const target of result.semanticAffectedTargets) {
            if (target.kind === 'logical-target') {
              const declSummary = target.declarations
                .map((d) => `${d.projectRelativePath}:${String(d.location.line)}`)
                .join(', ')
              lines.push(
                `  [logical] ${target.logicalSymbol.name} (${target.logicalSymbol.id}) depth=${String(target.depth)}: ${declSummary}`,
              )
            } else {
              lines.push(
                `  [physical-only] ${target.declaration.name} (${target.projectRelativePath}:${String(target.declaration.line)}) depth=${String(target.depth)}`,
              )
            }
          }
        }

        if (result.physicalEvidence && result.physicalEvidence.length > 0) {
          lines.push('')
          lines.push('Physical dependency evidence:')
          for (const ev of result.physicalEvidence) {
            const src = ev.sourceProjectRelativePath ?? ev.sourceDeclarationId
            const tgt = ev.targetProjectRelativePath ?? ev.targetDeclarationId
            lines.push(`  ${ev.relationType} ${src} -> ${tgt} (depth=${String(ev.depth)})`)
          }
        }

        lines.push(...formatCoveringSpecs(result.coveringSpecs))

        const omissionNotice = formatOmissionNotice(result.omittedCounts)
        if (omissionNotice !== undefined) {
          lines.push('')
          lines.push(omissionNotice)
        }
        output(lines.join('\n'), 'text')
      } else {
        output(
          {
            kind: 'symbol',
            status: 'resolved',
            targetKind: result.targetKind,
            resolvedTarget: result.resolvedTarget,
            ...(result.logicalSymbol !== undefined ? { logicalSymbol: result.logicalSymbol } : {}),
            declarations: result.declarations,
            semanticCounts: result.semanticCounts,
            semanticAffectedTargets: result.semanticAffectedTargets,
            physicalEvidence: result.physicalEvidence,
            coveringSpecs: result.coveringSpecs,
            symbol: result.symbol,
            projectRelativePath: result.projectRelativePath,
            riskLevel: result.riskLevel,
            directDepsCount: result.directDepsCount,
            indirectDepsCount: result.indirectDepsCount,
            transitiveDepsCount: result.transitiveDepsCount,
            affectedFilesCount: result.affectedFilesCount,
            directDependents: result.impact.directDependents,
            indirectDependents: result.impact.indirectDependents,
            transitiveDependents: result.impact.transitiveDependents,
            affectedFiles: result.impact.affectedFiles,
            omittedCounts: result.omittedCounts,
            impact: result.impact,
          },
          fmt,
        )
      }
    }
  }
}

/**
 * Handles spec-level impact analysis.
 * @param hostContext - The SDK host context.
 * @param specId - The spec identifier to analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param filter - Optional normalized provider-side impact filter.
 * @param provider - The code graph provider.
 */
async function handleSpecImpact(
  hostContext: SdkHostContext,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  filter: ImpactResultFilter | undefined,
  provider: GraphImpactProvider,
): Promise<void> {
  const result = await runGraphImpact(hostContext, {
    spec: specId,
    direction,
    depth: maxDepth,
    ...(filter !== undefined ? { filter } : {}),
    provider,
  })

  if (result.kind === 'spec') {
    if (fmt === 'text') {
      const lines = formatSpecImpact(result.spec, result.impact, maxDepth)
      const omissionNotice = formatOmissionNotice(result.omittedCounts)
      if (omissionNotice !== undefined) {
        lines.push('')
        lines.push(omissionNotice)
      }
      output(lines.join('\n'), 'text')
    } else {
      output(
        {
          spec: result.spec,
          riskLevel: result.riskLevel,
          directDepsCount: result.directDepsCount,
          indirectDepsCount: result.indirectDepsCount,
          transitiveDepsCount: result.transitiveDepsCount,
          affectedFilesCount: result.affectedFilesCount,
          omittedCounts: result.omittedCounts,
          impact: result.impact,
        },
        fmt,
      )
    }
  }
}
