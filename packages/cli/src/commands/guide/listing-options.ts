import { MissingGuideTopicError } from '../../errors/index.js'

/**
 * Default number of entries returned by one listing page.
 *
 * The bound keeps a listing readable when the active scope resolves to thousands of
 * generated API topics.
 */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Flags that narrow a document's body and therefore require a topic argument.
 *
 * Without a topic these flags would be silently dropped while the command rendered a
 * catalog listing, so they fail instead of appearing to have had an effect.
 */
const TOPIC_ONLY_FLAGS: readonly string[] = ['--section', '--start-line', '--lines']

/**
 * Pagination window resolved from `--page` and `--page-size`.
 */
export interface GuideListingPagination {
  /** 1-indexed page to return */
  readonly page: number
  /** Maximum entries per page */
  readonly pageSize: number
}

/**
 * Resolves `--page`/`--page-size` values into a pagination window.
 *
 * Values that are not positive integers fall back to the defaults so a malformed flag
 * can never widen the listing beyond its bound.
 *
 * @param page - Raw `--page` value
 * @param pageSize - Raw `--page-size` value
 * @returns The resolved pagination window
 */
export function resolveGuidePagination(
  page: number | undefined,
  pageSize: number | undefined,
): GuideListingPagination {
  return {
    page: isPositiveInteger(page) ? Math.floor(page) : 1,
    pageSize: isPositiveInteger(pageSize) ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE,
  }
}

/**
 * Tests whether a value is a usable positive integer option value.
 *
 * @param value - Raw option value
 * @returns True when the value is a finite number of at least 1
 */
function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
}

/**
 * Fails when a body-narrowing flag is passed without a topic argument.
 *
 * These flags only affect a document's body, so a listing invocation would drop them
 * without saying so.
 *
 * @param options - Parsed command options
 * @param options.section - Raw `--section` value
 * @param options.startLine - Raw `--start-line` value
 * @param options.lines - Raw `--lines` value
 * @throws {MissingGuideTopicError} When a body flag is set without a topic
 */
export function assertTopicRequired(options: {
  readonly section?: string
  readonly startLine?: number
  readonly lines?: number
}): void {
  const used = TOPIC_ONLY_FLAGS.filter((flag) => {
    if (flag === '--start-line') return options.startLine !== undefined
    if (flag === '--lines') return options.lines !== undefined
    return options.section !== undefined
  })

  if (used.length === 0) {
    return
  }

  throw new MissingGuideTopicError(
    `${used.join(', ')} ${used.length === 1 ? 'requires' : 'require'} a <topic> argument — pass the topic to retrieve, or drop the flag to list the catalog`,
  )
}
