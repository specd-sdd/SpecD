import {
  Logger,
  SpecdError,
  SchemaNotFoundError,
  SchemaValidationError,
  HookFailedError,
  HistoricalImplementationGuardError,
} from '@specd/sdk'
import { output } from './formatter.js'

/**
 *
 */
interface CliErrorOptions {
  /** Extra detail written to stderr before the main error line (e.g. hook stderr). */
  detail?: string | undefined
  /** Additional error metadata for structured output. */
  metadata?: Record<string, unknown> | undefined
}

/**
 * Exits with a CLI-level error. Writes a prefixed message to stderr and,
 * when format is `json` or `toon`, also emits a structured error to stdout.
 *
 * Use this instead of raw `process.stderr.write` + `process.exit()` so
 * that programmatic consumers always receive structured error output.
 *
 * @param message - Human-readable error description (without `error:`/`fatal:` prefix)
 * @param format - The raw format string from the CLI `--format` flag
 * @param exitCode - The exit code to use (default: 1)
 * @param code - Machine-readable error code (default: `'CLI_ERROR'`)
 * @param options - Optional extra fields
 */
export function cliError(
  message: string,
  format?: string,
  exitCode: number = 1,
  code: string = 'CLI_ERROR',
  options?: CliErrorOptions,
): never {
  if (options?.detail) {
    process.stderr.write(`${options.detail}\n`)
  }
  const prefix = exitCode === 3 ? 'fatal' : 'error'
  process.stderr.write(`${prefix}: ${message}\n`)
  if (format === 'json' || format === 'toon') {
    const payload: Record<string, unknown> = { result: 'error', code, message, exitCode }
    if (options?.metadata !== undefined && Object.keys(options.metadata).length > 0) {
      payload.metadata = options.metadata
    }
    output(payload, format)
  }
  process.exit(exitCode)
}

/**
 * Shape of an error compatible with SpecdError for structured output.
 */
interface SpecdErrorLike {
  /** The discriminator indicating this is a specd error */
  specd?: boolean
  /** The machine-readable error code */
  code: string
  /** The human-readable error message */
  message: string
  /** Optional command that failed (for hook errors) */
  command?: string
  /** Optional stderr output (for hook errors) */
  stderr?: string
  /** Additional contextual metadata for structured output. */
  [key: string]: unknown
}

const STRUCTURED_ERROR_BASE_FIELDS = new Set([
  'name',
  'message',
  'stack',
  'code',
  'specd',
  'command',
  'stderr',
])

/**
 * Extracts structured metadata fields from a Specd-compatible error.
 *
 * Own enumerable fields are included first, then getter-backed properties from
 * the prototype chain. Private backing fields and base error properties are
 * excluded from the structured metadata payload.
 *
 * @param err - The error object to inspect for metadata
 * @returns Structured metadata safe for JSON or TOON output
 */
function extractErrorMetadata(err: SpecdErrorLike): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}

  for (const key of Object.keys(err)) {
    if (STRUCTURED_ERROR_BASE_FIELDS.has(key) || key.startsWith('_')) continue
    const value: unknown = err[key]
    metadata[key] = value
  }

  let proto = getPrototype(err)
  while (proto !== null && proto !== Error.prototype && proto !== Object.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(proto)
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (STRUCTURED_ERROR_BASE_FIELDS.has(key) || key === 'constructor' || key in metadata) {
        continue
      }
      if (typeof descriptor.get !== 'function') continue
      try {
        const value: unknown = descriptor.get.call(err)
        metadata[key] = value
      } catch {
        // Ignore metadata getters that fail; error reporting must remain best-effort.
      }
    }
    proto = getPrototype(proto)
  }

  return metadata
}

/**
 * Safely retrieves the prototype of an object without leaking `any` into callers.
 *
 * @param value - The object whose prototype should be inspected
 * @returns The prototype object, or `null` when the prototype chain ends
 */
function getPrototype(value: object): object | null {
  return Object.getPrototypeOf(value) as object | null
}

/**
 * Type guard for errors conforming to the Specd Error Contract.
 * @param err - The error to check
 * @returns True if the error is SpecdError-like
 */
function isSpecdErrorLike(err: unknown): err is SpecdErrorLike {
  if (err instanceof SpecdError) {
    return true
  }
  return typeof err === 'object' && err !== null && 'specd' in err && err.specd === true
}

/**
 * Maps an error to the appropriate exit code, writes a message to stderr,
 * and optionally emits a structured error to stdout when format is `json`
 * or `toon`.
 *
 * Structured error output is only emitted for known error types (subtypes
 * of `SpecdError`). Generic or unexpected errors are written to stderr only.
 *
 * Exit codes:
 * - `1` — domain/user error (change not found, invalid transition, etc.)
 * - `2` — hook failure
 * - `3` — system/schema error or unexpected error
 *
 * This function never returns.
 *
 * @param err - The caught error
 * @param format - Optional output format; when `json` or `toon`, a structured error is also written to stdout
 * @returns Never. Always terminates the process with the mapped exit code.
 */
export function handleError(err: unknown, format?: string): never {
  // Known domain/application errors — all extend SpecdError with a machine-readable code
  if (isSpecdErrorLike(err)) {
    const code = err.code
    const metadata = extractErrorMetadata(err)

    if (err instanceof HookFailedError || code === 'HOOK_FAILED') {
      return cliError(`hook '${err.command}' failed`, format, 2, code, {
        detail: err.stderr,
        metadata,
      })
    }

    if (
      err instanceof SchemaNotFoundError ||
      err instanceof SchemaValidationError ||
      code === 'SCHEMA_NOT_FOUND' ||
      code === 'SCHEMA_VALIDATION_ERROR'
    ) {
      return cliError(err.message, format, 3, code, { metadata })
    }

    if (err instanceof HistoricalImplementationGuardError || code === 'IMPLEMENTATION_DETECTED') {
      return cliError(err.message, format, 1, code, { metadata })
    }

    if (code === 'GRAPH_BUSY' || code === 'GRAPH_PROVIDER_STALE') {
      return cliError(err.message, format, 3, code, { metadata })
    }

    // All other SpecdError subtypes → exit 1
    return cliError(err.message, format, 1, code, { metadata })
  }

  // Generic/unexpected errors — stderr only, no structured output
  const debug = Logger.isLevelEnabled('debug')
  if (err instanceof Error) {
    Logger.error('CLI command failed with unexpected error', { format }, err)
    process.stderr.write(`fatal: ${err.message}\n${debug && err.stack ? err.stack + '\n' : ''}`)
    process.exit(3)
  }

  Logger.error('CLI command failed with non-error throw', { format, value: String(err) })
  process.stderr.write(`fatal: unexpected error\n${debug ? String(err) + '\n' : ''}`)
  process.exit(3)
}
