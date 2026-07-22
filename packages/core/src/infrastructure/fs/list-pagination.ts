import {
  type ListCursor,
  type ListOptions,
  type ListResult,
} from '../../application/ports/repository.js'

/**
 * Applies shared list pagination to an in-memory sorted collection.
 *
 * @param allItems - Full result set in repository order (caller sorts first)
 * @param options - Pagination options
 * @param getCursor - Maps an item to its keyset cursor
 * @returns Paginated list envelope
 */
export function paginateList<T>(
  allItems: readonly T[],
  options: ListOptions | undefined,
  getCursor: (item: T) => ListCursor,
): ListResult<T> {
  const limit = options?.limit ?? 100
  const total = allItems.length

  let window = allItems
  let page: number | undefined

  if (options?.after !== undefined) {
    const afterCursor = options.after
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
    window = allItems.slice(startIdx)
  } else {
    page = options?.page ?? 1
    const offset = (page - 1) * limit
    window = allItems.slice(offset)
  }

  const items = window.slice(0, limit)
  const hasMore = window.length > limit
  const after = hasMore && items.length > 0 ? getCursor(items[items.length - 1]!) : undefined

  return {
    items,
    meta: {
      total,
      count: items.length,
      limit,
      ...(page !== undefined ? { page } : {}),
      ...(after !== undefined ? { after } : {}),
    },
  }
}

/**
 *
 * @param a
 * @param b
 */
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
