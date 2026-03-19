import { Command, Option } from 'commander'
import { createCodeGraphProvider } from '@specd/code-graph'
import { cliError } from '../../handle-error.js'
import { output, parseFormat } from '../../formatter.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { withProvider } from './with-provider.js'

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
 * Registers the `graph impact` command.
 * @param parent - The parent commander command.
 */
export function registerGraphImpact(parent: Command): void {
  parent
    .command('impact')
    .allowExcessArguments(false)
    .description('Analyze impact of changes to a file, symbol, or set of files')
    .option('--file <path>', 'analyze impact of a single file')
    .option('--symbol <name>', 'analyze impact of a symbol by name')
    .option('--changes <files...>', 'detect impact of changes to multiple files')
    .addOption(
      new Option('--direction <dir>', 'traversal direction')
        .choices(['upstream', 'downstream', 'both'])
        .default('upstream'),
    )
    .option('--depth <n>', 'max traversal depth (positive integer)', '3')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  --symbol (single match):
    { symbol: { id, name, kind, filePath, line, column, comment }, impact: ImpactResult }
  --symbol (multiple matches):
    Array<{ symbol: { id, name, kind, filePath, line, column, comment }, impact: ImpactResult }>
  --file:
    FileImpactResult (ImpactResult + symbols: ImpactResult[])
  --changes:
    { changedFiles: string[], changedSymbols: SymbolNode[], affectedSymbols: SymbolNode[],
      affectedFiles: string[], riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", summary: string }

  ImpactResult: { target, directDependents, indirectDependents, transitiveDependents,
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", affectedFiles: string[],
    affectedSymbols: Array<{ id, name, filePath }>, affectedProcesses: string[] }

  --symbol (no match):
    { error: "not_found", symbol: string }
`,
    )
    .action(
      async (opts: {
        file?: string
        symbol?: string
        changes?: string[]
        direction: string
        depth: string
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const direction = opts.direction as 'upstream' | 'downstream' | 'both'
        const maxDepth = parseInt(opts.depth, 10)
        if (Number.isNaN(maxDepth) || maxDepth <= 0) {
          cliError('--depth must be a positive integer', opts.format, 1)
        }

        const selectorCount = (opts.symbol ? 1 : 0) + (opts.changes ? 1 : 0) + (opts.file ? 1 : 0)
        if (selectorCount !== 1) {
          cliError('provide exactly one of --file, --symbol, or --changes', opts.format, 1)
        }

        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          if (opts.symbol) {
            await handleSymbolImpact(provider, opts.symbol, direction, maxDepth, fmt)
          } else if (opts.changes) {
            await handleChangesImpact(provider, opts.changes, maxDepth, fmt)
          } else if (opts.file) {
            await handleFileImpact(provider, opts.file, direction, maxDepth, fmt)
          }
        })
      },
    )
}

/**
 * Handles file-level impact analysis.
 * @param provider - The code graph provider.
 * @param file - The file path to analyze.
 * @param direction - The traversal direction.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 */
async function handleFileImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  file: string,
  direction: 'upstream' | 'downstream' | 'both',
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const result = await provider.analyzeFileImpact(file, direction, maxDepth)

  if (fmt === 'text') {
    const lines = formatImpact(file, result, maxDepth)

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

/**
 * Handles change detection across multiple files.
 * @param provider - The code graph provider.
 * @param files - The list of changed file paths.
 * @param maxDepth - Maximum traversal depth.
 * @param fmt - The output format.
 */
async function handleChangesImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  files: string[],
  maxDepth: number,
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const result = await provider.detectChanges(files, maxDepth)

  if (fmt === 'text') {
    output(result.summary, 'text')

    if (result.affectedFiles.length > 0) {
      const lines = ['', 'Affected files:']
      for (const f of result.affectedFiles) {
        lines.push(`  ${f}`)
      }
      output(lines.join('\n'), 'text')
    }
  } else {
    output(result, fmt)
  }
}
