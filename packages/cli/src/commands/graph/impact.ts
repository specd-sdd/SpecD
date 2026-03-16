import { Command } from 'commander'
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
  },
): string[] {
  const lines = [
    `Impact analysis for ${label}`,
    `  Risk level:       ${result.riskLevel}`,
    `  Direct deps:      ${String(result.directDependents)}`,
    `  Indirect deps:    ${String(result.indirectDependents)}`,
    `  Transitive deps:  ${String(result.transitiveDependents)}`,
    `  Affected files:   ${String(result.affectedFiles.length)}`,
  ]

  if (result.affectedFiles.length > 0) {
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
    .option('--direction <dir>', 'traversal direction: upstream|downstream|both', 'upstream')
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
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", affectedFiles: string[], affectedProcesses: string[] }

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
        format: string
      }) => {
        const fmt = parseFormat(opts.format)
        const direction = opts.direction as 'upstream' | 'downstream' | 'both'
        const { config } = await resolveCliContext()

        await withProvider(config, opts.format, async (provider) => {
          if (opts.symbol) {
            await handleSymbolImpact(provider, opts.symbol, direction, fmt)
          } else if (opts.changes) {
            await handleChangesImpact(provider, opts.changes, fmt)
          } else if (opts.file) {
            await handleFileImpact(provider, opts.file, direction, fmt)
          } else {
            cliError('provide --file, --symbol, or --changes', opts.format, 1)
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
 * @param fmt - The output format.
 */
async function handleFileImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  file: string,
  direction: 'upstream' | 'downstream' | 'both',
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const result = await provider.analyzeFileImpact(file, direction)

  if (fmt === 'text') {
    const lines = formatImpact(file, result)

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
 * @param fmt - The output format.
 */
async function handleSymbolImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  symbolName: string,
  direction: 'upstream' | 'downstream' | 'both',
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
    const result = await provider.analyzeImpact(sym.id, direction)

    if (fmt === 'text') {
      const lines = formatImpact(
        `${sym.kind} ${sym.name} (${sym.filePath}:${String(sym.line)})`,
        result,
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
      const result = await provider.analyzeImpact(sym.id, direction)
      allLines.push(
        ...formatImpact(`${sym.kind} ${sym.name} (${sym.filePath}:${String(sym.line)})`, result),
      )
      allLines.push('')
    }

    output(allLines.join('\n'), 'text')
  } else {
    const results = await Promise.all(
      symbols.map(async (sym) => ({
        symbol: sym,
        impact: await provider.analyzeImpact(sym.id, direction),
      })),
    )
    output(results, fmt)
  }
}

/**
 * Handles change detection across multiple files.
 * @param provider - The code graph provider.
 * @param files - The list of changed file paths.
 * @param fmt - The output format.
 */
async function handleChangesImpact(
  provider: Awaited<ReturnType<typeof createCodeGraphProvider>>,
  files: string[],
  fmt: 'text' | 'json' | 'toon',
): Promise<void> {
  const result = await provider.detectChanges(files)

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
