import { Command, Option } from 'commander'
import { isAbsolute, relative } from 'node:path'
import {
  createCodeGraphProvider,
  type FileImpactResult,
  GraphSpecNotFoundError as SpecNotFoundError,
} from '@specd/sdk'
import { cliError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { withProvider } from './with-provider.js'
import { warnGraphStale } from './warn-graph-staleness.js'

/** Provider-supported graph impact traversal directions. */
type ImpactDirection = 'upstream' | 'downstream' | 'both'

/**
 * Converts a CLI file selector into the config-relative form used in messages.
 * @param input - Raw file selector supplied by the user.
 * @param projectRoot - Optional project root for absolute selectors.
 * @returns The normalized display path.
 */
function normalizeFileSelectorPath(input: string, projectRoot?: string): string {
  const trimmed = input.trim()
  const relativePath = isAbsolute(trimmed)
    ? projectRoot === undefined
      ? null
      : relative(projectRoot, trimmed)
    : trimmed
  if (relativePath === null) return trimmed
  const normalized = relativePath.replaceAll('\\', '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

/** Shared impact payload shape used by text formatters in this command. */
type FormattedImpactResult = {
  riskLevel: string
  directDependents: number
  indirectDependents: number
  transitiveDependents: number
  affectedFiles: readonly string[]
  affectedSymbols?: readonly { name: string; filePath: string; line: number; depth: number }[]
}

/** Spec impact payload shape used by text formatters in this command. */
type FormattedSpecImpactResult = FormattedImpactResult & {
  affectedSpecs: readonly string[]
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
  const lines = formatImpact(`spec ${specId}`, result, maxDepth)
  lines.splice(6, 0, `  Affected specs:   ${String(result.affectedSpecs.length)}`)

  if (result.affectedSpecs.length > 0) {
    lines.push('')
    lines.push('Affected specs:')
    for (const affectedSpec of result.affectedSpecs) {
      lines.push(`  ${affectedSpec}`)
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
    .option('--spec <id>', 'analyze impact of a spec by identifier')
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
  --spec:
    { spec: string, impact: SpecImpactResult }
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
        spec?: string
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

        const selectorCount = (opts.symbol ? 1 : 0) + (opts.file ? 1 : 0) + (opts.spec ? 1 : 0)
        if (selectorCount !== 1) {
          cliError('provide exactly one of --file, --symbol, or --spec', opts.format, 1)
        }
        if (opts.config !== undefined && opts.path !== undefined) {
          cliError('--config and --path are mutually exclusive', opts.format, 1)
        }

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
        await withProvider(config, opts.format, async (provider) => {
          await warnGraphStale(provider, config, kernel)
          if (opts.symbol) {
            await handleSymbolImpact(provider, opts.symbol, direction, maxDepth, fmt)
          } else if (opts.spec) {
            await handleSpecImpact(provider, opts.spec, direction, maxDepth, fmt)
          } else if (opts.file) {
            await handleFilesImpact(
              provider,
              opts.file,
              direction,
              maxDepth,
              fmt,
              config.projectRoot,
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
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 * @param projectRoot - Project root used to normalize file selectors in error messages.
 */
async function handleFilesImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  rawSelectors: string[],
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
  projectRoot: string,
): Promise<void> {
  const resolved = []
  for (const rawSelector of rawSelectors) {
    const matches = await provider.resolveFileSelector(rawSelector)
    if (matches.length === 0) {
      const searchedPath = normalizeFileSelectorPath(rawSelector, projectRoot)
      cliError(`no indexed file matches "${searchedPath}"`, fmt, 1)
    }
    if (matches.length > 1) {
      cliError(
        `ambiguous selector "${rawSelector}": ${matches.map((m) => m.canonicalPath).join(', ')}`,
        fmt,
        1,
      )
    }
    resolved.push(matches[0]!)
  }

  const toDisplayPath = async (canonicalPath: string): Promise<string> => {
    const file = await provider.getFile(canonicalPath)
    if (file) return file.configRelativePath
    const document = await provider.getDocument(canonicalPath)
    if (document) return document.configRelativePath
    return canonicalPath
  }

  if (resolved.length === 1) {
    const file = resolved[0]!
    const result = await provider.analyzeFileImpact(file.canonicalPath, direction, maxDepth)
    const displayResult = {
      ...result,
      affectedFiles: await Promise.all(result.affectedFiles.map((path) => toDisplayPath(path))),
      affectedSymbols: result.affectedSymbols
        ? await Promise.all(
            result.affectedSymbols.map(async (symbol) => ({
              ...symbol,
              filePath: await toDisplayPath(symbol.filePath),
            })),
          )
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

  const result = await provider.analyzeFilesImpact(
    resolved.map((f) => f.canonicalPath),
    direction,
    maxDepth,
  )

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
        affectedFiles: await Promise.all(result.affectedFiles.map((path) => toDisplayPath(path))),
        perFile: await Promise.all(
          perFile.map(async ({ file, result: r }) => ({
            file: file.canonicalPath,
            displayPath: file.configRelativePath,
            result: {
              ...r,
              affectedFiles: await Promise.all(r.affectedFiles.map((path) => toDisplayPath(path))),
            },
          })),
        ),
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
 */
async function handleSymbolImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  symbolSelector: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const toDisplayPath = async (canonicalPath: string): Promise<string> => {
    const file = await provider.getFile(canonicalPath)
    if (file) return file.configRelativePath
    const document = await provider.getDocument(canonicalPath)
    if (document) return document.configRelativePath
    return canonicalPath
  }
  const resolved = await provider.resolveSymbolSelector(symbolSelector)
  const uniqueIds = [...new Set(resolved.map((symbol) => symbol.symbolId))]
  const symbols = (await Promise.all(uniqueIds.map((id) => provider.getSymbol(id)))).filter(
    (symbol) => symbol !== undefined,
  )

  if (symbols.length === 0) {
    if (fmt === 'text') {
      output(`No symbol found matching "${symbolSelector}".`, 'text')
    } else {
      output({ error: 'not_found', symbol: symbolSelector }, fmt)
    }
    return
  }

  if (symbols.length === 1) {
    const sym = symbols[0]!
    const result = await provider.analyzeImpact(sym.id, direction, maxDepth)
    const displayPath = await toDisplayPath(sym.filePath)
    const displayResult = {
      ...result,
      affectedFiles: await Promise.all(result.affectedFiles.map((path) => toDisplayPath(path))),
      affectedSymbols: await Promise.all(
        result.affectedSymbols.map(async (symbol) => ({
          ...symbol,
          filePath: await toDisplayPath(symbol.filePath),
        })),
      ),
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
    return
  }

  // Multiple matches — analyze each
  if (fmt === 'text') {
    const allLines = [`${String(symbols.length)} symbols match "${symbolSelector}":\n`]

    for (const sym of symbols) {
      const result = await provider.analyzeImpact(sym.id, direction, maxDepth)
      const displayPath = await toDisplayPath(sym.filePath)
      const displayResult = {
        ...result,
        affectedFiles: await Promise.all(result.affectedFiles.map((path) => toDisplayPath(path))),
        affectedSymbols: await Promise.all(
          result.affectedSymbols.map(async (symbol) => ({
            ...symbol,
            filePath: await toDisplayPath(symbol.filePath),
          })),
        ),
      }
      allLines.push(
        ...formatImpact(
          `${sym.kind} ${sym.name} (${displayPath}:${String(sym.line)})`,
          displayResult,
          maxDepth,
        ),
      )
      allLines.push('')
    }

    output(allLines.join('\n'), 'text')
  } else {
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const impact = await provider.analyzeImpact(sym.id, direction, maxDepth)
        return {
          symbol: sym,
          displayPath: await toDisplayPath(sym.filePath),
          impact: {
            ...impact,
            affectedFiles: await Promise.all(
              impact.affectedFiles.map((path) => toDisplayPath(path)),
            ),
            affectedSymbols: await Promise.all(
              impact.affectedSymbols.map(async (symbol) => ({
                ...symbol,
                filePath: await toDisplayPath(symbol.filePath),
              })),
            ),
          },
        }
      }),
    )
    output(results, fmt)
  }
}

/**
 * Handles spec-level impact analysis.
 * @param provider - The code graph provider.
 * @param specId - The spec identifier to analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 */
async function handleSpecImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  specId: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const spec = await provider.getSpec(specId)
  if (spec === undefined) {
    throw new SpecNotFoundError(specId)
  }

  const result = await provider.analyzeSpecImpact(specId, direction, maxDepth)
  const toDisplayPath = async (canonicalPath: string): Promise<string> => {
    const file = await provider.getFile(canonicalPath)
    if (file) return file.configRelativePath
    const document = await provider.getDocument(canonicalPath)
    if (document) return document.configRelativePath
    return canonicalPath
  }
  const displayResult = {
    ...result,
    affectedFiles: await Promise.all(result.affectedFiles.map((path) => toDisplayPath(path))),
    affectedSymbols: await Promise.all(
      result.affectedSymbols.map(async (sym) => ({
        ...sym,
        filePath: await toDisplayPath(sym.filePath),
      })),
    ),
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
