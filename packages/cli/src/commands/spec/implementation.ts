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
}
