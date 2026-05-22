import { stat } from 'node:fs/promises'
import path from 'node:path'
import { type Command } from 'commander'
import {
  ImplementationFileNotFoundError,
  type UpdateImplementationTrackingResult,
} from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { enrichImplementationTracking } from './_implementation-tracking.js'

/**
 * Registers the `change implementation` command group.
 *
 * @param parent - Parent commander command
 */
export function registerChangeImplementation(parent: Command): void {
  const command = parent
    .command('implementation')
    .description(
      'Review and mutate tracked implementation files and confirmed implementation links.',
    )

  command
    .command('list <name>')
    .description('List tracked implementation files and confirmed links for a change.')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      await renderImplementationState(name, opts)
    })

  command
    .command('review <name>')
    .description(
      'Review implementation tracking, including stale symbol diagnostics when graph data is available.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { format: string; config?: string }) => {
      await renderImplementationState(name, opts)
    })

  command
    .command('add <name>')
    .description('Add or enrich a confirmed implementation link. Validates file existence on disk.')
    .requiredOption('--spec <id>', 'target spec id')
    .requiredOption('--file <path>', 'raw project-relative file path')
    .option('--symbol <name>', 'implementation symbol name (repeatable)', collectString, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        opts: { spec: string; file: string; symbol: string[]; format: string; config?: string },
      ) => {
        await mutateImplementationTracking(name, {
          action: 'add',
          specId: opts.spec,
          files: [opts.file],
          symbols: opts.symbol,
          format: opts.format,
          ...(opts.config !== undefined ? { config: opts.config } : {}),
        })
      },
    )

  command
    .command('remove <name>')
    .description('Remove a confirmed implementation link or specific symbols from a link.')
    .requiredOption('--spec <id>', 'target spec id')
    .requiredOption('--file <path>', 'raw project-relative file path')
    .option('--symbol <name>', 'symbol name to remove (repeatable)', collectString, [])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        name: string,
        opts: { spec: string; file: string; symbol: string[]; format: string; config?: string },
      ) => {
        await mutateImplementationTracking(name, {
          action: 'remove',
          specId: opts.spec,
          files: [opts.file],
          symbols: opts.symbol,
          format: opts.format,
          ...(opts.config !== undefined ? { config: opts.config } : {}),
        })
      },
    )

  command
    .command('ignore <name>')
    .description(
      'Mark one or more tracked implementation files as ignored. Validates file existence on disk.',
    )
    .requiredOption(
      '--file <paths...>',
      'raw project-relative file paths (comma-separated list supported)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { file: string[]; format: string; config?: string }) => {
      await mutateImplementationTracking(name, {
        action: 'ignore',
        files: opts.file,
        format: opts.format,
        ...(opts.config !== undefined ? { config: opts.config } : {}),
      })
    })

  command
    .command('resolve <name>')
    .description(
      'Mark one or more tracked implementation files as resolved. Validates file existence on disk.',
    )
    .requiredOption(
      '--file <paths...>',
      'raw project-relative file paths (comma-separated list supported)',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { file: string[]; format: string; config?: string }) => {
      await mutateImplementationTracking(name, {
        action: 'resolve',
        files: opts.file,
        format: opts.format,
        ...(opts.config !== undefined ? { config: opts.config } : {}),
      })
    })
}

/**
 * Renders implementation review/list output for one change.
 *
 * @param name - Change name
 * @param opts - CLI options
 * @param opts.format - Output format
 * @param opts.config - Optional config path override
 * @returns When rendering completes
 */
async function renderImplementationState(
  name: string,
  opts: { format: string; config?: string },
): Promise<void> {
  try {
    const { config, kernel } = await resolveCliContext({ configPath: opts.config })
    const result = await kernel.changes.getImplementationReview.execute({ name })
    const enriched = await enrichImplementationTracking(config, result.implementationTracking)
    const outOfScopeSpecIds = [...new Set(enriched.links.map((link) => link.specId))].filter(
      (specId) => !result.specIds.includes(specId),
    )
    const fmt = parseFormat(opts.format)

    if (fmt === 'text') {
      const lines = [
        `change: ${name}`,
        `graph:  ${enriched.graphHint.message}`,
        '',
        'tracked files:',
      ]
      for (const state of ['open', 'resolved', 'ignored'] as const) {
        const files = enriched.trackedFiles.filter((entry) => entry.state === state)
        lines.push(
          `  ${state}: ${files.length > 0 ? files.map((entry) => entry.file).join(', ') : '(none)'}`,
        )
      }
      lines.push('')
      lines.push('out-of-scope sidecars:')
      lines.push(`  ${outOfScopeSpecIds.length > 0 ? outOfScopeSpecIds.join(', ') : '(none)'}`)
      lines.push('')
      lines.push('links:')
      if (enriched.links.length === 0) {
        lines.push('  (none)')
      } else {
        for (const link of enriched.links) {
          const symbols =
            link.symbols !== undefined && link.symbols.length > 0
              ? link.symbols.join(', ')
              : '(file-level)'
          const stale =
            link.staleSymbols.length > 0 ? `  stale=${link.staleSymbols.join(', ')}` : ''
          lines.push(`  - ${link.specId} -> ${link.file}  symbols=${symbols}${stale}`)
        }
      }
      output(lines.join('\n'), 'text')
      return
    }

    output(
      {
        name,
        trackedFiles: enriched.trackedFiles,
        links: enriched.links,
        graphHint: enriched.graphHint,
        outOfScopeSpecIds,
      },
      fmt,
    )
  } catch (error) {
    handleError(error, opts.format)
  }
}

/**
 * Applies one or more implementation-tracking mutations and renders the result.
 *
 * @param name - Change name
 * @param input - Mutation input and CLI options
 * @param input.action - Mutation kind
 * @param input.files - Raw project-relative file paths
 * @param input.specId - Optional target spec identifier
 * @param input.symbols - Optional symbol refinements
 * @param input.format - Output format
 * @param input.config - Optional config path override
 * @returns When the mutation command completes
 */
async function mutateImplementationTracking(
  name: string,
  input: {
    action: 'add' | 'remove' | 'ignore' | 'resolve'
    files: string[]
    specId?: string
    symbols?: readonly string[]
    format: string
    config?: string
  },
): Promise<void> {
  try {
    const { config, kernel } = await resolveCliContext({ configPath: input.config })

    // Support comma-separated lists in any of the file arguments
    const expandedFiles = input.files.flatMap((f) => f.split(',').map((p) => p.trim()))

    // Validate file existence for actions that specify a file (add, resolve, ignore)
    // Remove action might target a file that was already deleted but had links.
    if (input.action !== 'remove') {
      for (const file of expandedFiles) {
        const filePath = path.join(config.projectRoot, file)
        try {
          await stat(filePath)
        } catch {
          throw new ImplementationFileNotFoundError(file)
        }
      }
    }

    let lastResult: UpdateImplementationTrackingResult | undefined
    for (const file of expandedFiles) {
      lastResult = await kernel.changes.updateImplementationTracking.execute({
        name,
        action: input.action,
        file,
        ...(input.specId !== undefined ? { specId: input.specId } : {}),
        ...(input.symbols !== undefined && input.symbols.length > 0
          ? { symbols: input.symbols }
          : {}),
      })
    }

    const fmt = parseFormat(input.format)
    if (fmt === 'text') {
      output(`updated implementation tracking for ${name} (${input.action})`, 'text')
      return
    }
    output(
      {
        result: 'ok',
        name,
        action: input.action,
        // Return the last implementation tracking state
        implementationTracking: lastResult?.implementationTracking,
      },
      fmt,
    )
  } catch (error) {
    handleError(error, input.format)
  }
}

/**
 * Collects repeatable commander string options into an array.
 *
 * @param value - Newly parsed option value
 * @param previous - Accumulated option values
 * @returns Updated accumulated array
 */
function collectString(value: string, previous: string[]): string[] {
  return [...previous, value]
}
