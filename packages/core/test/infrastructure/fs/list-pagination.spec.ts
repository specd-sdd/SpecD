import { describe, expect, it } from 'vitest'
import { paginateList } from '../../../src/infrastructure/fs/list-pagination.js'
import { type ListCursor } from '../../../src/application/ports/repository.js'
import { InvalidInputError } from '../../../src/domain/errors/index.js'

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

  it('returns the full set when limit is omitted', () => {
    const result = paginateList(items, undefined, cursor)

    expect(result.items).toEqual(items)
    expect(result.meta).toEqual({ total: 4, count: 4, limit: 4 })
    expect(result.meta.after).toBeUndefined()
    expect(result.meta.page).toBeUndefined()
  })

  it('sets meta.limit to 0 for an empty unpaginated list', () => {
    const result = paginateList([], undefined, cursor)

    expect(result.items).toEqual([])
    expect(result.meta).toEqual({ total: 0, count: 0, limit: 0 })
  })

  it('throws InvalidInputError when page is set without limit', () => {
    expect(() => paginateList(items, { page: 1 }, cursor)).toThrow(InvalidInputError)
    try {
      paginateList(items, { page: 1 }, cursor)
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidInputError)
      expect((err as InvalidInputError).code).toBe('INVALID_INPUT')
      expect((err as InvalidInputError).message).toBe('page requires an explicit limit')
    }
  })

  it('throws InvalidInputError when page and after are both set', () => {
    expect(() =>
      paginateList(items, { page: 1, limit: 2, after: { key: 'a', id: '1' } }, cursor),
    ).toThrow(InvalidInputError)
    try {
      paginateList(items, { page: 1, limit: 2, after: { key: 'a', id: '1' } }, cursor)
    } catch (err) {
      expect((err as InvalidInputError).code).toBe('INVALID_INPUT')
      expect((err as InvalidInputError).message).toBe('page and after are mutually exclusive')
    }
  })

  it('returns the remainder after the cursor when after is set without limit', () => {
    const result = paginateList(items, { after: { key: 'a', id: '1' } }, cursor)

    expect(result.items).toEqual([{ key: 'a', id: '2' }, { key: 'b', id: '1' }, { key: 'c' }])
    expect(result.meta).toEqual({ total: 4, count: 3, limit: 3 })
    expect(result.meta.after).toBeUndefined()
  })

  it('sets meta.after to the last returned item when more remain (after mode)', () => {
    const result = paginateList(items, { limit: 2, after: { key: 'a', id: '1' } }, cursor)

    expect(result.items).toEqual([
      { key: 'a', id: '2' },
      { key: 'b', id: '1' },
    ])
    expect(result.meta.after).toEqual({ key: 'b', id: '1' })
    expect(result.meta.limit).toBe(2)
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
    expect(result.meta.page).toBe(1)
  })

  it('sets meta.after on an intermediate page (page mode)', () => {
    const result = paginateList(items, { limit: 2, page: 1 }, cursor)

    expect(result.items).toEqual([
      { key: 'a', id: '1' },
      { key: 'a', id: '2' },
    ])
    expect(result.meta.after).toEqual({ key: 'a', id: '2' })
    expect(result.meta.page).toBe(1)
  })

  it('does not echo the request after cursor as meta.after', () => {
    const requestAfter = { key: 'a', id: '1' }
    const result = paginateList(items, { limit: 2, after: requestAfter }, cursor)

    expect(result.meta.after).not.toEqual(requestAfter)
    expect(result.meta.after).toEqual({ key: 'b', id: '1' })
  })
})
