import { describe, it, expect, vi } from 'vitest'
import { UpdateSpecDeps } from '../../../src/application/use-cases/update-spec-deps.js'
import { makeChange, makeChangeRepository } from './helpers.js'

describe('UpdateSpecDeps', () => {
  it('adds deps to a spec in the change', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['auth/shared', 'auth/jwt'],
    })

    expect(result.specId).toBe('auth/login')
    expect(result.dependsOn).toEqual(['auth/shared', 'auth/jwt'])

    // Verify persisted
    const saved = await repo.get('my-change')
    expect([...saved!.specDependsOn.get('auth/login')!]).toEqual(['auth/shared', 'auth/jwt'])
  })

  it('persists through ChangeRepository.mutate', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = new UpdateSpecDeps(repo)

    await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['auth/shared'],
    })

    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
  })

  it('removes deps from a spec in the change', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    change.setSpecDependsOn('auth/login', ['auth/shared', 'auth/jwt', 'auth/core'])
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      remove: ['auth/jwt'],
    })

    expect(result.dependsOn).toEqual(['auth/shared', 'auth/core'])
  })

  it('sets (replaces) deps for a spec', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    change.setSpecDependsOn('auth/login', ['auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      set: ['billing/core', 'billing/shared'],
    })

    expect(result.dependsOn).toEqual(['billing/core', 'billing/shared'])
  })

  it('throws when specId is not in change.specIds', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'unknown/spec', add: ['x'] }),
    ).rejects.toThrow(/not in change/)
  })

  it('throws when --set used with --add', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', set: ['a'], add: ['b'] }),
    ).rejects.toThrow(/mutually exclusive/)
  })

  it('throws when change not found', async () => {
    const repo = makeChangeRepository([])
    const uc = new UpdateSpecDeps(repo)

    await expect(
      uc.execute({ name: 'nonexistent', specId: 'auth/login', add: ['x'] }),
    ).rejects.toThrow(/not found/)
  })

  it('throws when no operation specified', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    await expect(uc.execute({ name: 'my-change', specId: 'auth/login' })).rejects.toThrow(
      /at least one/,
    )
  })

  it('throws when removing a dep not in current list', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    change.setSpecDependsOn('auth/login', ['auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', remove: ['unknown'] }),
    ).rejects.toThrow(/not found in current deps/)
  })

  it('does not add duplicate deps', async () => {
    const change = makeChange('my-change', { specIds: ['auth/login'] })
    change.setSpecDependsOn('auth/login', ['auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = new UpdateSpecDeps(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['auth/shared', 'auth/jwt'],
    })

    expect(result.dependsOn).toEqual(['auth/shared', 'auth/jwt'])
  })
})
