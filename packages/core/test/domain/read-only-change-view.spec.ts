import { describe, it, expect } from 'vitest'
import { makeChange, testActor } from '../application/use-cases/helpers.js'
import {
  toDiscardedChangeView,
  toDraftedChangeView,
} from '../../src/domain/read-only-change-view.js'
import { InvalidChangeError } from '../../src/domain/errors/invalid-change-error.js'

describe('read-only change views', () => {
  it('toDraftedChangeView rejects active changes', () => {
    const change = makeChange('active')
    expect(() => toDraftedChangeView(change)).toThrow(InvalidChangeError)
  })

  it('toDraftedChangeView exposes drafted read model', () => {
    const change = makeChange('parked')
    change.draft(testActor, 'waiting')
    const view = toDraftedChangeView(change)
    expect(view.isDrafted).toBe(true)
    expect(view.name).toBe('parked')
    const drafted = view.history.find((e) => e.type === 'drafted')
    expect(drafted?.type).toBe('drafted')
    if (drafted?.type === 'drafted') expect(drafted.reason).toBe('waiting')
  })

  it('toDiscardedChangeView maps discard metadata', () => {
    const change = makeChange('gone')
    change.discard('superseded', testActor, ['replacement'])
    const view = toDiscardedChangeView(change)
    expect(view.discardReason).toBe('superseded')
    expect(view.supersededBy).toEqual(['replacement'])
  })
})
