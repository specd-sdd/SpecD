import { describe, it, expect } from 'vitest'
import { GetDraft } from '../../../src/application/use-cases/get-draft.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeChange, testActor } from './helpers.js'

describe('GetDraft', () => {
  it('returns a drafted view when the change is in drafts', async () => {
    const change = makeChange('parked')
    change.draft(testActor)
    const repo = makeChangeRepository([change])
    const uc = new GetDraft(repo)

    const { view } = await uc.execute({ name: 'parked' })

    expect(view.name).toBe('parked')
    expect(view.isDrafted).toBe(true)
  })

  it('throws ChangeNotFoundError when the name is not drafted', async () => {
    const repo = makeChangeRepository([makeChange('active-only')])
    const uc = new GetDraft(repo)

    await expect(uc.execute({ name: 'active-only' })).rejects.toThrow(ChangeNotFoundError)
  })
})
