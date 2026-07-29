import { readFile } from 'node:fs/promises'
import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError, cliError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'
import { readStdin } from '../../helpers/read-stdin.js'

/**
 * Supported persisted optimization field names.
 */
type OptimizationField = 'optimizedDescription' | 'optimizedContext'

/**
 * Commander option shape for `specs optimizations set`.
 */
interface SetOptimizationOptions {
  readonly input?: string
  readonly optimizedDescription?: string
  readonly optimizedContext?: string
  readonly format: string
  readonly config?: string
}

/**
 * Commander option shape for `specs optimizations clear`.
 */
interface ClearOptimizationOptions {
  readonly field: readonly string[]
  readonly optimizedDescription?: boolean
  readonly optimizedContext?: boolean
  readonly format: string
  readonly config?: string
}

const OPTIMIZATION_FIELD_NAMES = ['optimizedDescription', 'optimizedContext'] as const
const OPTIMIZATION_FIELDS = new Set<OptimizationField>(OPTIMIZATION_FIELD_NAMES)

/**
 * Detects the test-only sentinel thrown by mocked `process.exit()`.
 *
 * @param error - Unknown error from a command action
 * @returns True when the error matches the process-exit sentinel shape
 */
function isProcessExitError(error: unknown): boolean {
  return error instanceof Error && /^process\.exit\(\d+\)$/.test(error.message)
}

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
): Partial<Record<OptimizationField, string>> {
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

  const result: Partial<Record<OptimizationField, string>> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!OPTIMIZATION_FIELDS.has(key as OptimizationField)) {
      cliError(`invalid field '${key}' — allowed: optimizedDescription, optimizedContext`, format)
    }
    if (typeof value !== 'string') {
      cliError(`invalid value for '${key}' — expected string`, format)
    }
    result[key as OptimizationField] = value
  }

  if (Object.keys(result).length === 0) {
    cliError('invalid JSON: object must include at least one optimization field', format)
  }

  return result
}

/**
 * Normalizes set options into one typed optimization payload.
 *
 * @param options - Commander options for the set command
 * @returns Normalized values for the Core `set` payload
 */
async function resolveOptimizationSet(
  options: SetOptimizationOptions,
): Promise<Partial<Record<OptimizationField, string>>> {
  const directSet: Partial<Record<OptimizationField, string>> = {}
  if (options.optimizedDescription !== undefined) {
    directSet.optimizedDescription = options.optimizedDescription
  }
  if (options.optimizedContext !== undefined) {
    directSet.optimizedContext = options.optimizedContext
  }

  const hasInput = options.input !== undefined
  const hasDirectValues = Object.keys(directSet).length > 0

  if (hasInput && hasDirectValues) {
    cliError(
      '--input cannot be combined with --optimized-description or --optimized-context',
      options.format,
    )
  }

  if (!hasInput && !hasDirectValues) {
    cliError(
      'set requires --input or at least one of --optimized-description/--optimized-context',
      options.format,
    )
  }

  if (hasInput) {
    const raw = await readInput(options.input)
    return parseOptimizationSetInput(raw, options.format)
  }

  return directSet
}

/**
 * Normalizes clear options into unique optimization field names.
 *
 * @param options - Commander options for the clear command
 * @returns Unique field names for the Core `clear` payload
 */
function resolveOptimizationClear(options: ClearOptimizationOptions): OptimizationField[] {
  const directClear: OptimizationField[] = []
  if (options.optimizedDescription) {
    directClear.push('optimizedDescription')
  }
  if (options.optimizedContext) {
    directClear.push('optimizedContext')
  }

  if (options.field.length > 0 && directClear.length > 0) {
    cliError(
      '--field cannot be combined with --optimized-description or --optimized-context',
      options.format,
    )
  }

  if (options.field.length === 0 && directClear.length === 0) {
    cliError(
      'clear requires --field or at least one of --optimized-description/--optimized-context',
      options.format,
    )
  }

  const result =
    directClear.length > 0
      ? directClear
      : options.field.map((field) => {
          if (!OPTIMIZATION_FIELDS.has(field as OptimizationField)) {
            cliError(
              `invalid field '${field}' — allowed: optimizedDescription, optimizedContext`,
              options.format,
            )
          }
          return field as OptimizationField
        })

  return [...new Set(result)]
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
        if (opts.field !== undefined && !OPTIMIZATION_FIELDS.has(opts.field as OptimizationField)) {
          cliError(`--field must be optimizedDescription or optimizedContext`, opts.format)
        }
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.getPersistedOptimizations.execute({
          specId,
          ...(opts.field !== undefined ? { field: opts.field as OptimizationField } : {}),
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          if (!result.initialized) {
            output(`spec ${specId} is not initialized — run specs init first`, 'text')
            return
          }
          const hasOptimizationFields = OPTIMIZATION_FIELD_NAMES.some(
            (name) => result[name] !== undefined,
          )
          if (!hasOptimizationFields) {
            output('no persisted optimization values', 'text')
            return
          }
          for (const name of OPTIMIZATION_FIELD_NAMES) {
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
        if (isProcessExitError(err)) {
          throw err
        }
        handleError(err, opts.format)
      }
    })

  command
    .command('set <specPath>')
    .allowExcessArguments(false)
    .description('Set persisted optimization field values from JSON.')
    .option('--input <path>', 'JSON file path, or - for stdin')
    .option('--optimized-description <text>', 'direct optimized description value')
    .option('--optimized-context <text>', 'direct optimized context value')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: SetOptimizationOptions) => {
      try {
        const set = await resolveOptimizationSet(opts)
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
        if (isProcessExitError(err)) {
          throw err
        }
        handleError(err, opts.format)
      }
    })

  command
    .command('clear <specPath>')
    .allowExcessArguments(false)
    .description('Clear persisted optimization fields.')
    .option('--field <name>', 'field to clear (repeatable)', collect, [] as string[])
    .option('--optimized-description', 'clear optimizedDescription directly')
    .option('--optimized-context', 'clear optimizedContext directly')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (specPath: string, opts: ClearOptimizationOptions) => {
      try {
        const clear = resolveOptimizationClear(opts)
        const { config, kernel } = await resolveCliContext({ configPath: opts.config })
        const specId = parseSpecId(specPath, config).specId
        const result = await kernel.specs.updatePersistedOptimizations.execute({
          specId,
          clear,
        })
        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`cleared optimizations for ${result.specId}`, 'text')
          if (result.optimizations === undefined) {
            output('optimizations: none', 'text')
          } else {
            for (const [key, value] of Object.entries(result.optimizations)) {
              output(`${key}: ${value}`, 'text')
            }
          }
        } else {
          output({ result: 'ok', ...result }, fmt)
        }
      } catch (err) {
        if (isProcessExitError(err)) {
          throw err
        }
        handleError(err, opts.format)
      }
    })
}
