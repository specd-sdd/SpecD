import { Command, Option } from 'commander'
import { createCodeGraphProvider } from '@specd/code-graph'
import { cliError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { assertGraphIndexUnlocked } from './graph-index-lock.js'
import { resolveImpactFileSelectors } from './resolve-impact-file-selectors.js'

/** Provider-supported graph impact traversal directions. */
type ImpactDirection = 'upstream' | 'downstream' | 'both'

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
 * @param maxDepth - Maximum traversal depth used (default: 3). Non-default values shown in header.
 * @returns An array of formatted lines.
 */
function formatImpact(
  label: string,
  result: {
    riskLevel: string
    directDependents: number
    indirectDependents: number
    transitiveDependents: number
    affectedFiles: readonly string[]
    affectedSymbols?: readonly { name: string; filePath: string; line: number; depth: number }[]
  },
  maxDepth = 3,
): string[] {
  const depthSuffix = maxDepth !== 3 ? ` (depth=${String(maxDepth)})` : ''
  const lines = [
    `Impact analysis for ${label}${depthSuffix}`,
    `  Risk level:       ${result.riskLevel}`,
    `  Direct deps:      ${String(result.directDependents)}`,
    `  Indirect deps:    ${String(result.indirectDependents)}`,
    `  Transitive deps:  ${String(result.transitiveDependents)}`,
    `  Affected files:   ${String(result.affectedFiles.length)}`,
  ]

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

  return lines
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
    .addOption(
      new Option(
        '--direction <dir>',
        'impact direction: dependents|dependencies|upstream|downstream|both',
      ).default('dependents'),
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
  --symbol (no match):
    { error: "not_found", symbol: string }

  ImpactResult: { target, directDependents, indirectDependents, transitiveDependents,
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", affectedFiles: string[],
    affectedSymbols: Array<{ id, name, filePath }>, affectedProcesses: string[] }
`,
    )
    .action(
      async (opts: {
        file?: string[]
        symbol?: string
        direction: string
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

        const selectorCount = (opts.symbol ? 1 : 0) + (opts.file ? 1 : 0)
        if (selectorCount !== 1) {
          cliError('provide exactly one of --file or --symbol', opts.format, 1)
        }
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }

        const { config } = await resolveGraphCliContext({
          configPath: opts.config,
          repoPath: opts.path,
        }).catch((err: unknown) =>
          cliError(
            err instanceof Error ? err.message : 'failed to resolve graph context',
            opts.format,
            1,
          ),
        )
        assertGraphIndexUnlocked(config)

        await withProvider(config, opts.format, async (provider) => {
          if (opts.symbol) {
            await handleSymbolImpact(provider, opts.symbol, direction, maxDepth, fmt)
          } else if (opts.file) {
            await handleFilesImpact(
              provider,
              opts.file,
              config.projectRoot,
              direction,
              maxDepth,
              fmt,
            )
          }
        })
      },
    )
}

/**
 * Handles file-level impact analysis.
 * @param provider - The code graph provider.
 * @param rawSelectors - The file selectors to resolve and analyze.
 * @param projectRoot - The project root directory.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 */
async function handleFilesImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  rawSelectors: string[],
  projectRoot: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const resolved = await resolveImpactFileSelectors(provider, rawSelectors, projectRoot).catch(
    (err: unknown) => {
      cliError(err instanceof Error ? err.message : 'failed to resolve file selectors', fmt, 1)
    },
  )

  if (resolved.length === 1) {
    const file = resolved[0]!
    const result = await provider.analyzeFileImpact(file.path, direction, maxDepth)

    if (fmt === 'text') {
      const lines = formatImpact(file.path, result, maxDepth)

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
      output(lines.join('\n'), 'text')
    } else {
      output(result, fmt)
    }
    return
  }

  const perFile = await Promise.all(
    resolved.map(async (f) => {
      const result = await provider.analyzeFileImpact(f.path, direction, maxDepth)
      return { file: f, result }
    }),
  )

  const allAffectedFiles = new Set<string>()
  let directDependents = 0
  let indirectDependents = 0
  let transitiveDependents = 0
  let overallRisk: string = 'LOW'
  const riskOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

  for (const { result } of perFile) {
    for (const f of result.affectedFiles) allAffectedFiles.add(f)
    directDependents += result.directDependents
    indirectDependents += result.indirectDependents
    transitiveDependents += result.transitiveDependents
    const ri = riskOrder.indexOf(result.riskLevel as (typeof riskOrder)[number])
    const oi = riskOrder.indexOf(overallRisk as (typeof riskOrder)[number])
    if (ri > oi) overallRisk = result.riskLevel
  }

  if (fmt === 'text') {
    const label =
      resolved.length <= 3
        ? resolved.map((f) => f.path).join(', ')
        : `${String(resolved.length)} files`
    const lines = formatImpact(
      label,
      {
        riskLevel: overallRisk,
        directDependents,
        indirectDependents,
        transitiveDependents,
        affectedFiles: [...allAffectedFiles],
      },
      maxDepth,
    )

    const allChangedSymbols = perFile.flatMap(({ file, result }) =>
      result.symbols.map((s) => ({ file: file.path, symbol: s })),
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
    for (const { file, result } of perFile) {
      lines.push(
        `  ${file.path}  risk=${result.riskLevel} direct=${String(result.directDependents)} files=${String(result.affectedFiles.length)}`,
      )
    }
    output(lines.join('\n'), 'text')
  } else {
    output(
      {
        targets: resolved.map((f) => f.path),
        riskLevel: overallRisk,
        directDependents,
        indirectDependents,
        transitiveDependents,
        affectedFiles: [...allAffectedFiles],
        perFile: perFile.map(({ file, result }) => ({ file: file.path, result })),
      },
      fmt,
    )
  }
}

/**
 * Handles symbol-level impact analysis.
 * @param provider - The code graph provider.
 * @param symbolName - The symbol name to search for.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 */
async function handleSymbolImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  symbolName: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const symbols = await provider.findSymbols({ name: symbolName })

  if (symbols.length === 0) {
    if (fmt === 'text') {
      output(`No symbol found matching "${symbolName}".`, 'text')
    } else {
      output({ error: 'not_found', symbol: symbolName }, fmt)
    }
    return
  }

  if (symbols.length === 1) {
    const sym = symbols[0]!
    const result = await provider.analyzeImpact(sym.id, direction, maxDepth)

    if (fmt === 'text') {
      const lines = formatImpact(
        `${sym.kind} ${sym.name} (${sym.filePath}:${String(sym.line)})`,
        result,
        maxDepth,
      )
      output(lines.join('\n'), 'text')
    } else {
      output({ symbol: sym, impact: result }, fmt)
    }
    return
  }

  // Multiple matches — analyze each
  if (fmt === 'text') {
    const allLines = [`${String(symbols.length)} symbols match "${symbolName}":\n`]

    for (const sym of symbols) {
      const result = await provider.analyzeImpact(sym.id, direction, maxDepth)
      allLines.push(
        ...formatImpact(
          `${sym.kind} ${sym.name} (${sym.filePath}:${String(sym.line)})`,
          result,
          maxDepth,
        ),
      )
      allLines.push('')
    }

    output(allLines.join('\n'), 'text')
  } else {
    const results = await Promise.all(
      symbols.map(async (sym) => ({
        symbol: sym,
        impact: await provider.analyzeImpact(sym.id, direction, maxDepth),
      })),
    )
    output(results, fmt)
  }
}
