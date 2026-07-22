import {
  type ListCursor,
  type ListOptions,
  type ListResult,
} from '../../application/ports/repository.js'
import { InvalidInputError } from '../../domain/errors/index.js'

/**
 * Applies shared list pagination to an in-memory sorted collection.
 *
 * @param allItems - Full result set in repository order (caller sorts first)
 * @param options - Pagination options
 * @param getCursor - Maps an item to its keyset cursor
 * @returns Paginated list envelope
 * @throws {InvalidInputError} When `page` is set without `limit` or together with `after`
 */
export function paginateList<T>(
  allItems: readonly T[],
  options: ListOptions | undefined,
  getCursor: (item: T) => ListCursor,
): ListResult<T> {
  const total = allItems.length
  const limit = options?.limit
  const page = options?.page
  const after = options?.after

  if (page !== undefined && limit === undefined) {
    throw new InvalidInputError('page requires an explicit limit')
  }
  if (page !== undefined && after !== undefined) {
    throw new InvalidInputError('page and after are mutually exclusive')
  }

  if (limit === undefined && after === undefined) {
    return {
      items: allItems,
      meta: {
        total,
        count: total,
        limit: total,
      },
    }
  }

  if (limit === undefined && after !== undefined) {
    const startIdx = findStartIndex(allItems, after, getCursor)
    const items = allItems.slice(startIdx)
    return {
      items,
      meta: {
        total,
        count: items.length,
        limit: items.length,
      },
    }
  }

  if (limit === undefined) {
    throw new InvalidInputError('page requires an explicit limit')
  }

  let window = allItems
  let resolvedPage: number | undefined

  if (after !== undefined) {
    const startIdx = findStartIndex(allItems, after, getCursor)
    window = allItems.slice(startIdx)
  } else {
    resolvedPage = page ?? 1
    const offset = (resolvedPage - 1) * limit
    window = allItems.slice(offset)
  }

  const items = window.slice(0, limit)
  const hasMore = window.length > limit
  const metaAfter = hasMore && items.length > 0 ? getCursor(items[items.length - 1]!) : undefined

  return {
    items,
    meta: {
      total,
      count: items.length,
      limit,
      ...(resolvedPage !== undefined ? { page: resolvedPage } : {}),
      ...(metaAfter !== undefined ? { after: metaAfter } : {}),
    },
  }
}

/**
 * Finds the first index strictly after `afterCursor` in canonical sort order.
 *
 * @param allItems - Full sorted collection
 * @param afterCursor - Exclusive keyset cursor
 * @param getCursor - Maps an item to its keyset cursor
 * @returns Start index for the remainder window
 */
function findStartIndex<T>(
  allItems: readonly T[],
  afterCursor: ListCursor,
  getCursor: (item: T) => ListCursor,
): number {
  let startIdx = allItems.findIndex((item) => {
    const cursor = getCursor(item)
    return cursor.key === afterCursor.key && cursor.id === afterCursor.id
  })
  if (startIdx >= 0) {
    startIdx += 1
  } else {
    startIdx = allItems.findIndex((item) => compareCursor(getCursor(item), afterCursor) > 0)
    if (startIdx < 0) startIdx = allItems.length
  }
  return startIdx
}

/**
 * Compares two keyset cursors in canonical sort order.
 *
 * @param a - First cursor
 * @param b - Second cursor
 * @returns Negative when `a` sorts before `b`, positive when after, zero when equal
 */
function compareCursor(a: ListCursor, b: ListCursor): number {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1
  const aId = a.id ?? ''
  const bId = b.id ?? ''
  if (aId === bId) return 0
  return aId < bId ? -1 : 1
}
