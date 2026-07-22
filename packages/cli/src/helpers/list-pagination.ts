import { CliValidationError } from '../errors/cli-validation-error.js'

/** Default page size for change-bucket list commands when `--limit` is omitted. */
export const DEFAULT_LIST_LIMIT = 100

/** Exclusive keyset cursor for paginated lists. */
export interface ListCursor {
  readonly key: string
  readonly id?: string
}

/** Pagination options forwarded to list use cases and repository ports. */
export interface ListOptions {
  readonly limit?: number
  readonly page?: number
  readonly after?: ListCursor
}

/** Raw CLI flags before mapping to {@link ListOptions}. */
export interface ListPaginationFlags {
  readonly limit?: string
  readonly page?: number
  readonly afterKey?: string
  readonly afterId?: string
}

/** Parsed `--limit` flag: numeric page size, unlimited (`all`), or omitted. */
export type ParsedLimit = { kind: 'number'; value: number } | { kind: 'all' } | { kind: 'omitted' }

/** Options for {@link parseListPaginationFlags}. */
export interface ParseListPaginationOptions {
  allowAfterId?: boolean
  /** When set, omitted --limit becomes this numeric limit. Spec list passes undefined. */
  defaultLimit?: number
}

/**
 * Parses a raw `--limit` flag value.
 *
 * @param raw - Raw option value from Commander
 * @returns Parsed limit kind
 * @throws {CliValidationError} When the value is not a positive integer or `all`
 */
export function parseLimitFlag(raw: string | undefined): ParsedLimit {
  if (raw === undefined) return { kind: 'omitted' }
  if (raw === 'all') return { kind: 'all' }
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0 || String(value) !== raw.trim()) {
    throw new CliValidationError('--limit must be a positive integer or "all"')
  }
  return { kind: 'number', value }
}

/**
 * Maps CLI pagination flags to {@link ListOptions}.
 *
 * @param flags - Parsed Commander option values
 * @param options - Parsing options
 * @returns List options for use-case invocation
 * @throws {CliValidationError} When pagination flags are mutually exclusive or invalid
 */
export function parseListPaginationFlags(
  flags: ListPaginationFlags,
  options?: ParseListPaginationOptions,
): ListOptions {
  const allowAfterId = options?.allowAfterId ?? true
  const { page, afterKey, afterId } = flags
  const parsedLimit = parseLimitFlag(flags.limit)

  if (page !== undefined && afterKey !== undefined) {
    throw new CliValidationError('--page is mutually exclusive with --after-key/--after-id')
  }
  if (afterId !== undefined && afterKey === undefined) {
    throw new CliValidationError('--after-id requires --after-key')
  }
  if (!allowAfterId && afterId !== undefined) {
    throw new CliValidationError('--after-id is not supported for this command')
  }
  if (page !== undefined && parsedLimit.kind === 'all') {
    throw new CliValidationError('--page requires a numeric --limit')
  }
  if (page !== undefined && parsedLimit.kind === 'omitted' && options?.defaultLimit === undefined) {
    throw new CliValidationError('--page requires a numeric --limit')
  }

  const result: {
    limit?: number
    page?: number
    after?: ListCursor
  } = {}

  if (parsedLimit.kind === 'number') {
    result.limit = parsedLimit.value
  } else if (parsedLimit.kind === 'omitted' && options?.defaultLimit !== undefined) {
    result.limit = options.defaultLimit
  }

  if (page !== undefined) result.page = page
  if (afterKey !== undefined) {
    result.after =
      allowAfterId && afterId !== undefined ? { key: afterKey, id: afterId } : { key: afterKey }
  }

  return result
}

/**
 * Returns the standardized truncation hint when a page is incomplete.
 *
 * @param meta - List metadata with count and total
 * @param meta.count - Number of items returned in the current page
 * @param meta.total - Total number of items across all pages
 * @returns Hint line or `null` when the full result set is shown
 */
export function formatTruncationHint(meta: { count: number; total: number }): string | null {
  if (meta.count < meta.total) {
    return `showing ${meta.count} of ${meta.total} (use --limit/--page)`
  }
  return null
}

import { type Command } from 'commander'

/**
 * Registers shared pagination flags on a Commander command.
 *
 * @param command - Commander command to extend
 * @param options - Flag registration options
 * @param options.includeAfterId - When false, omit `--after-id` (spec lists)
 * @param options.defaultLimit - When set, help text documents this host default
 */
export function addListPaginationOptions(
  command: Command,
  options?: { includeAfterId?: boolean; defaultLimit?: number },
): void {
  const limitHelp =
    options?.defaultLimit !== undefined
      ? `maximum number of entries to return (default ${String(options.defaultLimit)}; use "all" for no limit)`
      : 'maximum number of entries to return (optional; use "all" for no limit)'

  command.option('--limit <n>', limitHelp)
  command.option('--page <p>', '1-based page number', (v) => parseInt(v, 10))
  command.option('--after-key <key>', 'exclusive keyset cursor sort key')
  if (options?.includeAfterId !== false) {
    command.option('--after-id <id>', 'tiebreak id when used with --after-key')
  }
}
