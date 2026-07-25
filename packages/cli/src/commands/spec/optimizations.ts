import { readFile } from 'node:fs/promises'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { readStdin } from '../../helpers/read-stdin.js'

const OPTIMIZATION_FIELDS = new Set(['optimizedDescription', 'optimizedContext'])

/**
 * Reads optimization JSON from a file path or stdin.
 *
 * @param path - File path, or `-` for stdin
 * @returns File contents as UTF-8 text
 */
async function readInput(path: string): Promise<string> {
  if (path === '-') {
    return readStdin()
  }
  return readFile(path, 'utf8')
}

/**
 * Parses and validates optimization field values from JSON input.
 *
 * @param raw - Raw JSON text
 * @param format - CLI output format used for error reporting
 * @returns Parsed optimization fields
 */
function parseOptimizationSetInput(
  raw: string,
  format: string,
): Partial<Record<'optimizedDescription' | 'optimizedContext', string>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cliError(`invalid JSON: ${message}`, format)
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    cliError('invalid JSON: expected an object', format)
  }

  const result: Partial<Record<'optimizedDescription' | 'optimizedContext', string>> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!OPTIMIZATION_FIELDS.has(key)) {
      cliError(`invalid field '${key}' — allowed: optimizedDescription, optimizedContext`, format)
    }
    if (typeof value !== 'string') {
      cliError(`invalid value for '${key}' — expected string`, format)
    }
    result[key as 'optimizedDescription' | 'optimizedContext'] = value
  }

  if (Object.keys(result).length === 0) {
    cliError('invalid JSON: object must include at least one optimization field', format)
  }

  return result
}

/**
 * Registers the `spec optimizations` command group.
 *
 * @param parent - Parent commander command
 */
export function registerSpecOptimizations(parent: Command): void {
  const command = parent
    .command('optimizations')
    .description('Inspect and mutate persisted LLM optimization fields for a spec.')

  command
    .command('get <specPath>')
    .allowExcessArguments(false)
    .description('Show persisted optimization fields and freshness.')
    .option('--field <name>', 'filter to optimizedDescription or optimizedContext')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { field?: string; format: string; config?: string }) => {
      try {
        if (opts.field !== undefined && !OPTIMIZATION_FIELDS.has(opts.field)) {
          cliError(`--field must be optimizedDescription or optimizedContext`, opts.format)
        }
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.getPersistedOptimizations.execute({
          specId,
          ...(opts.field !== undefined
            ? { field: opts.field as 'optimizedDescription' | 'optimizedContext' }
            : {}),
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          if (!result.initialized) {
            output(`spec ${specId} is not initialized — run specs init first`, 'text')
            return
          }
          for (const name of ['optimizedDescription', 'optimizedContext'] as const) {
            const field = result[name]
            if (field === undefined) continue
            if (field.freshness === 'missing') {
              output(`${name}: missing`, 'text')
              output('', 'text')
              continue
            }
            const status =
              field.freshness === 'fresh' ? 'fresh' : `STALE (${field.reasons.join(', ')})`
            output(`${name}: ${status}`, 'text')
            if (field.value !== undefined) {
              output(field.value, 'text')
            }
            output('', 'text')
          }
          return
        }
        output({ result: 'ok', ...result }, fmt)
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('set <specPath>')
    .allowExcessArguments(false)
    .description('Set persisted optimization field values from JSON.')
    .requiredOption('--input <path>', 'JSON file path, or - for stdin')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: { input: string; format: string; config?: string }) => {
      try {
        const raw = await readInput(opts.input)
        const set = parseOptimizationSetInput(raw, opts.format)
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.updatePersistedOptimizations.execute({ specId, set })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`updated optimizations for ${result.specId}`, 'text')
          if (result.optimizations !== undefined) {
            for (const [key, value] of Object.entries(result.optimizations)) {
              output(`${key}: ${value}`, 'text')
            }
          }
        } else {
          output({ result: 'ok', ...result }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  command
    .command('clear <specPath>')
    .allowExcessArguments(false)
    .description('Clear persisted optimization fields.')
    .requiredOption('--field <name>', 'field to clear (repeatable)', collect, [] as string[])
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (specPath: string, opts: { field: string[]; format: string; config?: string }) => {
        try {
          if (opts.field.length === 0) {
            cliError('--field requires at least one value', opts.format)
          }
          for (const field of opts.field) {
            if (!OPTIMIZATION_FIELDS.has(field)) {
              cliError(
                `invalid field '${field}' — allowed: optimizedDescription, optimizedContext`,
                opts.format,
              )
            }
          }
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })
          const specId = parseSpecId(specPath, config).specId
          const result = await kernel.specs.updatePersistedOptimizations.execute({
            specId,
            clear: opts.field as Array<'optimizedDescription' | 'optimizedContext'>,
          })
          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            output(`cleared optimizations for ${result.specId}`, 'text')
          } else {
            output({ result: 'ok', ...result }, fmt)
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}
