import {
  SpecdError,
  SchemaNotFoundError,
  SchemaValidationError,
  HookFailedError,
} from '@specd/core'
import { output } from './formatter.js'

/**
 *
 */
interface CliErrorOptions {
  /** Extra detail written to stderr before the main error line (e.g. hook stderr). */
  detail?: string
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
    output({ result: 'error', code, message, exitCode }, format)
  }
  process.exit(exitCode)
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
  if (err instanceof SpecdError) {
    if (err instanceof HookFailedError) {
      return cliError(`hook '${err.command}' failed`, format, 2, err.code, { detail: err.stderr })
    }

    if (err instanceof SchemaNotFoundError || err instanceof SchemaValidationError) {
      return cliError(err.message, format, 3, err.code)
    }

    // All other SpecdError subtypes → exit 1
    return cliError(err.message, format, 1, err.code)
  }

  // Generic/unexpected errors — stderr only, no structured output
  const debug = process.env['SPECD_DEBUG'] === '1'
  if (err instanceof Error) {
    process.stderr.write(`fatal: ${err.message}\n${debug && err.stack ? err.stack + '\n' : ''}`)
    process.exit(3)
  }

  process.stderr.write(`fatal: unexpected error\n${debug ? String(err) + '\n' : ''}`)
  process.exit(3)
}
