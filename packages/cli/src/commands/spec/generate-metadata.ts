import { type Command } from 'commander'
import { SpecPath, type SpecMetadataStatus } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

const VALID_STATUS_VALUES = new Set<SpecMetadataStatus | 'all'>([
  'stale',
  'missing',
  'invalid',
  'fresh',
  'all',
])

/**
 * Registers the `spec generate-metadata` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerSpecGenerateMetadata(parent: Command): void {
  parent
    .command('generate-metadata [specPath]')
    .allowExcessArguments(false)
    .description('Generate metadata deterministically from schema extraction rules')
    .option('--write', 'write the generated metadata')
    .option('--force', 'overwrite existing metadata without conflict detection (requires --write)')
    .option('--all', 'generate metadata for all specs matching --status filter')
    .option('--status <values>', 'comma-separated status filter for --all (default: stale,missing)')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  Without --write: { spec: string, metadata: object }
  With --write:    { result: "ok", spec: string, written: true }
`,
    )
    .action(
      async (
        specPath: string | undefined,
        opts: {
          format: string
          config?: string
          write?: boolean
          force?: boolean
          all?: boolean
          status?: string
        },
      ) => {
        try {
          // --- Flag validation ---
          if (opts.all === true && opts.write !== true) {
            cliError('--all requires --write', opts.format)
          }
          if (opts.all === true && specPath !== undefined) {
            cliError('--all and <specPath> are mutually exclusive', opts.format)
          }
          if (opts.status !== undefined && opts.all !== true) {
            cliError('--status requires --all', opts.format)
          }
          if (opts.force === true && opts.write !== true) {
            cliError('--force requires --write', opts.format)
          }
          if (opts.all !== true && specPath === undefined) {
            cliError('either <specPath> or --all is required', opts.format)
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          if (opts.all === true) {
            await executeBatch(kernel, config, opts)
          } else {
            await executeSingle(kernel, config, specPath!, opts)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Executes single-spec metadata generation (existing behaviour).
 *
 * @param kernel - The wired kernel instance
 * @param config - The loaded specd configuration
 * @param specPath - The spec path argument (e.g. `"core:config"`)
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.write - Whether to persist the generated metadata
 * @param opts.force - Whether to skip conflict detection
 */
async function executeSingle(
  kernel: import('@specd/core').Kernel,
  config: import('@specd/core').SpecdConfig,
  specPath: string,
  opts: { format: string; write?: boolean; force?: boolean },
): Promise<void> {
  const parsed = parseSpecId(specPath, config)
  const specId = `${parsed.workspace}:${parsed.capabilityPath}`
  const result = await kernel.specs.generateMetadata.execute({ specId })

  if (!result.hasExtraction) {
    cliError('schema has no metadataExtraction declarations', opts.format)
  }

  const jsonContent = JSON.stringify(result.metadata, null, 2) + '\n'

  if (opts.write === true) {
    await kernel.specs.saveMetadata.execute({
      workspace: parsed.workspace,
      specPath: SpecPath.parse(parsed.capabilityPath),
      content: jsonContent,
      ...(opts.force === true ? { force: true } : {}),
    })

    const fmt = parseFormat(opts.format)
    if (fmt === 'text') {
      output(`wrote metadata for ${specId}`, 'text')
    } else {
      output({ result: 'ok', spec: specId, written: true }, fmt)
    }
  } else {
    const fmt = parseFormat(opts.format)
    if (fmt === 'text') {
      output(jsonContent.trimEnd(), 'text')
    } else {
      output({ spec: specId, metadata: result.metadata }, fmt)
    }
  }
}

/**
 * Executes batch metadata generation for all specs matching the status filter.
 *
 * @param kernel - The wired kernel instance
 * @param _config - The loaded specd configuration (unused in batch mode)
 * @param opts - Command options
 * @param opts.format - Output format
 * @param opts.force - Whether to skip conflict detection
 * @param opts.status - Comma-separated status filter (default: `"stale,missing"`)
 */
async function executeBatch(
  kernel: import('@specd/core').Kernel,
  _config: import('@specd/core').SpecdConfig,
  opts: { format: string; force?: boolean; status?: string },
): Promise<void> {
  // Parse and validate --status
  let statusFilter: Set<SpecMetadataStatus | 'all'>
  try {
    statusFilter = parseCommaSeparatedValues(
      opts.status ?? 'stale,missing',
      VALID_STATUS_VALUES,
      '--status',
    )
  } catch (err) {
    cliError(err instanceof Error ? err.message : String(err), opts.format)
    return // unreachable — cliError exits, but TS needs this
  }

  const filterAll = statusFilter.has('all')

  // List all specs with metadata status
  const entries = await kernel.specs.list.execute({ includeMetadataStatus: true })

  // Filter by status
  const matching = filterAll
    ? entries
    : entries.filter((e) => e.metadataStatus !== undefined && statusFilter.has(e.metadataStatus))

  if (matching.length === 0) {
    const fmt = parseFormat(opts.format)
    if (fmt === 'text') {
      output('no specs match the status filter', 'text')
    } else {
      output({ result: 'ok', total: 0, succeeded: 0, failed: 0, specs: [] }, fmt)
    }
    return
  }

  // Process all specs
  const results: Array<{ spec: string; status: 'ok' | 'error'; error?: string }> = []
  let succeeded = 0
  let failed = 0
  let extractionChecked = false

  for (const entry of matching) {
    const specId = `${entry.workspace}:${entry.path}`
    try {
      const genResult = await kernel.specs.generateMetadata.execute({ specId })

      // Check hasExtraction once on the first spec
      if (!extractionChecked) {
        extractionChecked = true
        if (!genResult.hasExtraction) {
          cliError('schema has no metadataExtraction declarations', opts.format)
        }
      }

      const jsonContent = JSON.stringify(genResult.metadata, null, 2) + '\n'
      await kernel.specs.saveMetadata.execute({
        workspace: entry.workspace,
        specPath: SpecPath.parse(entry.path),
        content: jsonContent,
        ...(opts.force === true ? { force: true } : {}),
      })
      results.push({ spec: specId, status: 'ok' })
      succeeded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ spec: specId, status: 'error', error: msg })
      failed++
    }
  }

  // Output
  const fmt = parseFormat(opts.format)
  if (fmt === 'text') {
    for (const r of results) {
      if (r.status === 'ok') {
        output(`wrote metadata for ${r.spec}`, 'text')
      } else {
        output(`error: ${r.spec}: ${r.error}`, 'text')
      }
    }
    output(`generated metadata for ${succeeded}/${matching.length} specs`, 'text')
  } else {
    const batchResult = failed === 0 ? 'ok' : succeeded === 0 ? 'error' : 'partial'
    output(
      {
        result: batchResult,
        total: matching.length,
        succeeded,
        failed,
        specs: results,
      },
      fmt,
    )
  }

  if (failed > 0) {
    process.exitCode = 1
  }
}
