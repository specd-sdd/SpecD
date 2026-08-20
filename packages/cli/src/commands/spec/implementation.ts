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
    .description('Suggest implementation links for specs based on static analysis.')
    .option('--spec <id>', 'spec id (repeatable)', collect, [])
    .option('--all', 'suggest for all specs')
    .option('--workspace <name>', 'target workspace')
    .option('--apply', 'apply suggested links to spec-lock.json')
    .option('--confidence <level>', 'confidence threshold: HIGH|MEDIUM|MED|LOW')
    .option('--rebuild-cache', 'force cache invalidation')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        specPath: string | undefined,
        opts: {
          spec: string[]
          all?: boolean
          workspace?: string
          apply?: boolean
          confidence?: string
          rebuildCache?: boolean
          format: string
          config?: string
        },
      ) => {
        try {
          const { config } = await resolveCliContext({ configPath: opts.config })
          const { createSuggestImplementationLinks } = await import('@specd/sdk')
          const useCase = createSuggestImplementationLinks(config)
          const targetSpecId = specPath ? parseSpecId(specPath, config).specId : undefined
          const specIds = opts.spec.length > 0 ? opts.spec.map((s) => parseSpecId(s, config).specId) : undefined
          const fmt = parseFormat(opts.format)

          const isInteractiveText = fmt === 'text' && Boolean(process.stderr?.isTTY || process.stdout?.isTTY)
          const spinner = isInteractiveText ? (await import('nanospinner')).createSpinner('Analyzing implementation links...').start() : null

          let result
          try {
            result = await useCase.execute({
              ...(targetSpecId !== undefined ? { specId: targetSpecId } : {}),
              ...(specIds !== undefined ? { specIds } : {}),
              ...(opts.workspace !== undefined ? { workspace: opts.workspace } : {}),
              ...(opts.all !== undefined ? { all: opts.all } : {}),
              ...(opts.apply !== undefined ? { apply: opts.apply } : {}),
              ...(opts.confidence !== undefined ? { confidenceThreshold: opts.confidence as 'HIGH' | 'MEDIUM' | 'MED' | 'LOW' } : {}),
              ...(opts.rebuildCache !== undefined ? { rebuildCache: opts.rebuildCache } : {}),
              ...(spinner
                ? {
                    onProgress: (evt) => {
                      if (evt.type === 'discovery-start') {
                        spinner.update({ text: 'Discovering specifications across workspaces...' })
                      } else if (evt.type === 'start') {
                        spinner.update({ text: `Analyzing implementation links for ${evt.totalSpecs} specification(s)...` })
                      } else if (evt.type === 'spec-start') {
                        spinner.update({ text: `[${evt.index}/${evt.totalSpecs}] Analyzing ${evt.specId}...` })
                      }
                    },
                  }
                : {}),
            })
            if (spinner) {
              spinner.stop()
            }
          } catch (err) {
            if (spinner) {
              spinner.error({ text: 'Implementation link analysis failed' })
            }
            throw err
          }

          if (fmt === 'text') {
            output('suggested implementation links:', 'text')
            for (const spec of result.specs) {
              output(`  ${spec.specId}`, 'text')
              if (spec.existing.files.length > 0) {
                output(`    existing:`, 'text')
                for (const f of spec.existing.files) {
                  output(`      ${f}`, 'text')
                }
              }
              if (spec.suggestions.length === 0) {
                output(`    suggestions: (none)`, 'text')
              } else {
                output(`    suggestions:`, 'text')
                for (const sug of spec.suggestions) {
                  const tag = sug.alreadyIncluded ? '[already included]' : '[new]'
                  const symsStr = sug.symbols.length > 0 ? ` [${sug.symbols.join(', ')}]` : ''
                  output(`      ${tag} [${sug.confidence}] ${sug.file}${symsStr}`, 'text')
                }
              }
            }
            if (result.appliedMutations) {
              output(
                `applied mutations: updated ${result.appliedMutations.updatedSpecsCount} specs (${result.appliedMutations.filesAddedCount} files, ${result.appliedMutations.symbolsAddedCount} symbols added)`,
                'text',
              )
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
