import { CliValidationError } from '../errors/cli-validation-error.js'

/** Default page size for list commands when `--limit` is omitted. */
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
  readonly limit?: number
  readonly page?: number
  readonly afterKey?: string
  readonly afterId?: string
}

/**
 * Maps CLI pagination flags to {@link ListOptions}.
 *
 * @param flags - Parsed Commander option values
 * @param options - Parsing options
 * @param options.allowAfterId - When false, `--after-id` is rejected (spec lists)
 * @returns List options for use-case invocation
 * @throws {CliValidationError} When pagination flags are mutually exclusive or invalid
 */
export function parseListPaginationFlags(
  flags: ListPaginationFlags,
  options?: { allowAfterId?: boolean },
): ListOptions {
  const allowAfterId = options?.allowAfterId ?? true
  const { limit, page, afterKey, afterId } = flags

  if (page !== undefined && afterKey !== undefined) {
    throw new CliValidationError('--page is mutually exclusive with --after-key/--after-id')
  }
  if (afterId !== undefined && afterKey === undefined) {
    throw new CliValidationError('--after-id requires --after-key')
  }
  if (!allowAfterId && afterId !== undefined) {
    throw new CliValidationError('--after-id is not supported for this command')
  }

  const result: {
    limit?: number
    page?: number
    after?: ListCursor
  } = {}

  if (limit !== undefined) result.limit = limit
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
 */
export function addListPaginationOptions(
  command: Command,
  options?: { includeAfterId?: boolean },
): void {
  command.option(
    '--limit <n>',
    `maximum number of entries to return (default ${DEFAULT_LIST_LIMIT.toString()})`,
    (v) => parseInt(v, 10),
  )
  command.option('--page <p>', '1-based page number', (v) => parseInt(v, 10))
  command.option('--after-key <key>', 'exclusive keyset cursor sort key')
  if (options?.includeAfterId !== false) {
    command.option('--after-id <id>', 'tiebreak id when used with --after-key')
  }
}
