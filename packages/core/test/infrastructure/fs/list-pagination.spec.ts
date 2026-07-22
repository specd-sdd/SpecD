import { describe, expect, it } from 'vitest'
import { paginateList } from '../../../src/infrastructure/fs/list-pagination.js'
import { type ListCursor } from '../../../src/application/ports/repository.js'

interface Item {
  key: string
  id?: string
}

function cursor(item: Item): ListCursor {
  return { key: item.key, ...(item.id !== undefined ? { id: item.id } : {}) }
}

describe('paginateList', () => {
  const items: Item[] = [
    { key: 'a', id: '1' },
    { key: 'a', id: '2' },
    { key: 'b', id: '1' },
    { key: 'c' },
  ]

  it('sets meta.after to the last returned item when more remain (after mode)', () => {
    const result = paginateList(items, { limit: 2, after: { key: 'a', id: '1' } }, cursor)

    expect(result.items).toEqual([
      { key: 'a', id: '2' },
      { key: 'b', id: '1' },
    ])
    expect(result.meta.after).toEqual({ key: 'b', id: '1' })
  })

  it('omits meta.after on the last page (after mode)', () => {
    const result = paginateList(items, { limit: 10, after: { key: 'a', id: '2' } }, cursor)

    expect(result.items).toHaveLength(2)
    expect(result.meta.after).toBeUndefined()
  })

  it('omits meta.after when the full set fits in one page (page mode)', () => {
    const result = paginateList(items, { limit: 10, page: 1 }, cursor)

    expect(result.items).toHaveLength(4)
    expect(result.meta.after).toBeUndefined()
  })

  it('sets meta.after on an intermediate page (page mode)', () => {
    const result = paginateList(items, { limit: 2, page: 1 }, cursor)

    expect(result.items).toEqual([
      { key: 'a', id: '1' },
      { key: 'a', id: '2' },
    ])
    expect(result.meta.after).toEqual({ key: 'a', id: '2' })
  })

  it('does not echo the request after cursor as meta.after', () => {
    const requestAfter = { key: 'a', id: '1' }
    const result = paginateList(items, { limit: 2, after: requestAfter }, cursor)

    expect(result.meta.after).not.toEqual(requestAfter)
    expect(result.meta.after).toEqual({ key: 'b', id: '1' })
  })
})
