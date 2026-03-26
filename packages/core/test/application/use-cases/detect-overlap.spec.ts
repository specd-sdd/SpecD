import { describe, it, expect } from 'vitest'
import { DetectOverlap } from '../../../src/application/use-cases/detect-overlap.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { makeChangeRepository, makeChange } from './helpers.js'

describe('DetectOverlap', () => {
  it('returns empty report when no changes exist', async () => {
    const repo = makeChangeRepository()
    const uc = new DetectOverlap(repo)

    const result = await uc.execute()
    expect(result.hasOverlap).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('delegates to repository and domain service', async () => {
    const a = makeChange('alpha', { specIds: ['core:core/config'] })
    const b = makeChange('beta', { specIds: ['core:core/config'] })
    const repo = makeChangeRepository([a, b])
    const uc = new DetectOverlap(repo)

    const result = await uc.execute()
    expect(result.hasOverlap).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.specId).toBe('core:core/config')
  })

  it('returns full report when no name filter provided', async () => {
    const a = makeChange('alpha', { specIds: ['core:core/config', 'core:core/kernel'] })
    const b = makeChange('beta', { specIds: ['core:core/config'] })
    const c = makeChange('gamma', { specIds: ['core:core/kernel'] })
    const repo = makeChangeRepository([a, b, c])
    const uc = new DetectOverlap(repo)

    const result = await uc.execute()
    expect(result.entries).toHaveLength(2)
  })

  it('filters output to named change', async () => {
    const a = makeChange('alpha', { specIds: ['core:core/config'] })
    const b = makeChange('beta', { specIds: ['core:core/config', 'core:core/kernel'] })
    const c = makeChange('gamma', { specIds: ['core:core/kernel'] })
    const repo = makeChangeRepository([a, b, c])
    const uc = new DetectOverlap(repo)

    const result = await uc.execute({ name: 'alpha' })
    expect(result.hasOverlap).toBe(true)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.specId).toBe('core:core/config')
  })

  it('returns empty report when named change has no overlap', async () => {
    const a = makeChange('alpha', { specIds: ['core:core/config'] })
    const b = makeChange('beta', { specIds: ['core:core/kernel'] })
    const repo = makeChangeRepository([a, b])
    const uc = new DetectOverlap(repo)

    const result = await uc.execute({ name: 'alpha' })
    expect(result.hasOverlap).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('throws ChangeNotFoundError when named change does not exist', async () => {
    const repo = makeChangeRepository([])
    const uc = new DetectOverlap(repo)

    await expect(uc.execute({ name: 'nonexistent' })).rejects.toThrow(ChangeNotFoundError)
  })
})
