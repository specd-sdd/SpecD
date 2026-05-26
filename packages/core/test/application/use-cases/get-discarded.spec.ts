import { describe, it, expect } from 'vitest'
import { GetDiscarded } from '../../../src/application/use-cases/get-discarded.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'

describe('GetDiscarded', () => {
  it('returns a discarded view with discardReason', async () => {
    const change = makeChange('gone')
    change.discard('no longer needed', testActor)
    const repo = makeChangeRepository([change])
    const uc = new GetDiscarded(repo)

    const { view } = await uc.execute({ name: 'gone' })

    expect(view.name).toBe('gone')
    expect(view.discardReason).toBe('no longer needed')
  })

  it('throws ChangeNotFoundError when the name is not discarded', async () => {
    const repo = makeChangeRepository([makeChange('active-only')])
    const uc = new GetDiscarded(repo)

    await expect(uc.execute({ name: 'active-only' })).rejects.toThrow(ChangeNotFoundError)
  })
})
