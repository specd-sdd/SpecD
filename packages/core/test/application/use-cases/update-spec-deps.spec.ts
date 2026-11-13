import { describe, it, expect, vi } from 'vitest'
import { UpdateSpecDeps } from '../../../src/application/use-cases/update-spec-deps.js'
import { InvalidSpecIdError } from '../../../src/domain/errors/invalid-spec-id-error.js'
import { WorkspaceNotFoundError } from '../../../src/domain/errors/workspace-not-found-error.js'
import { InvalidInputError } from '../../../src/domain/errors/invalid-input-error.js'
import { makeChange, makeChangeRepository } from './helpers.js'

const WORKSPACES = ['default', 'billing', 'core'] as const

function makeUc(
  repo: ReturnType<typeof makeChangeRepository>,
  workspaces: readonly string[] = WORKSPACES,
) {
  return new UpdateSpecDeps(repo, workspaces)
}

describe('UpdateSpecDeps', () => {
  it('adds deps to a spec in the change and stores them fully qualified', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['auth/shared', 'auth/jwt'],
    })

    expect(result.specId).toBe('default:auth/login')
    expect(result.dependsOn).toEqual(['default:auth/shared', 'default:auth/jwt'])

    const saved = await repo.get('my-change')
    expect([...saved!.specDependsOn.get('default:auth/login')!]).toEqual([
      'default:auth/shared',
      'default:auth/jwt',
    ])
  })

  it('reuses workspace names from a one-shot Map.keys() iterable on later executions', async () => {
    const change = makeChange('repeated', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const workspaceNames = new Map([
      ['default', true],
      ['billing', true],
    ])
    const uc = new UpdateSpecDeps(repo, workspaceNames.keys())

    const first = await uc.execute({
      name: 'repeated',
      specId: 'auth/login',
      add: ['billing:shared'],
    })
    const second = await uc.execute({
      name: 'repeated',
      specId: 'auth/login',
      add: ['billing:session'],
    })

    expect(first.dependsOn).toEqual(['billing:shared'])
    expect(second.dependsOn).toEqual(['billing:shared', 'billing:session'])
    expect((await repo.get('repeated'))?.specDependsOn.get('default:auth/login')).toEqual([
      'billing:shared',
      'billing:session',
    ])
  })

  it('persists through ChangeRepository.mutate (SDK-style, no CLI)', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await uc.execute({
      name: 'my-change',
      specId: 'default:auth/login',
      add: ['default:auth/shared'],
    })

    expect(mutateSpy).toHaveBeenCalledOnce()
    expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
  })

  it('removes deps from a spec in the change', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', [
      'default:auth/shared',
      'default:auth/jwt',
      'default:auth/core',
    ])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      remove: ['auth/jwt'],
    })

    expect(result.dependsOn).toEqual(['default:auth/shared', 'default:auth/core'])
  })

  it('sets (replaces) deps for a spec', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      set: ['billing:core', 'billing:shared'],
    })

    expect(result.dependsOn).toEqual(['billing:core', 'billing:shared'])
  })

  it('clears all dependencies', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared', 'default:auth/jwt'])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      clear: true,
    })

    expect(result.dependsOn).toEqual([])
    const saved = await repo.get('my-change')
    expect([...saved!.specDependsOn.get('default:auth/login')!]).toEqual([])
  })

  describe('exclusivity matrix', () => {
    it.each([
      [{ set: ['default:a'], clear: true }],
      [{ clear: true, add: ['default:a'] }],
      [{ clear: true, remove: ['default:a'] }],
      [{ set: ['default:a'], add: ['default:b'] }],
      [{ set: ['default:a'], remove: ['default:b'] }],
    ])('rejects conflicting ops %j', async (ops) => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:a'])
      const repo = makeChangeRepository([change])
      const uc = makeUc(repo)

      await expect(
        uc.execute({ name: 'my-change', specId: 'default:auth/login', ...ops }),
      ).rejects.toThrow(InvalidInputError)
      expect([...change.specDependsOn.get('default:auth/login')!]).toEqual(['default:a'])
    })

    it('allows add+remove together', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared', 'default:auth/jwt'])
      const repo = makeChangeRepository([change])
      const uc = makeUc(repo)

      const result = await uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        add: ['auth/core'],
        remove: ['auth/jwt'],
      })

      expect(result.dependsOn).toEqual(['default:auth/shared', 'default:auth/core'])
    })
  })

  it('rejects set [""] and stores nothing', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', set: [''] }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(mutateSpy).not.toHaveBeenCalled()
    expect([...change.specDependsOn.get('default:auth/login')!]).toEqual(['default:auth/shared'])
  })

  it("rejects add [' '] and stores nothing", async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', add: [' '] }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(mutateSpy).not.toHaveBeenCalled()
    expect(change.specDependsOn.get('default:auth/login')).toBeUndefined()
  })

  it('rejects a comma-containing dependency ID as one whole value', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await expect(
      uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        add: ['a,b'],
      }),
    ).rejects.toThrow(InvalidSpecIdError)

    await expect(
      uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        set: ['core:a,b'],
      }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(mutateSpy).not.toHaveBeenCalled()
    expect([...change.specDependsOn.get('default:auth/login')!]).toEqual(['default:auth/shared'])
  })

  it('rejects a malformed dependency ID and stores nothing', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', add: ['Auth/Login'] }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(mutateSpy).not.toHaveBeenCalled()
  })

  it('rejects an unknown workspace', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    await expect(
      uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        add: ['unknown-ws:foo'],
      }),
    ).rejects.toThrow(WorkspaceNotFoundError)
  })

  it('accepts a non-existent dependency target without checking existence', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['default:does-not-exist'],
    })

    expect(result.dependsOn).toEqual(['default:does-not-exist'])
  })

  it('stores bare IDs as fully qualified', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      set: ['auth/shared'],
    })

    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('stores nothing when one invalid entry is among valid ones', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const mutateSpy = vi.spyOn(repo, 'mutate')
    const uc = makeUc(repo)

    await expect(
      uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        add: ['auth/jwt', 'Auth/Bad', 'auth/core'],
      }),
    ).rejects.toThrow(InvalidSpecIdError)

    expect(mutateSpy).not.toHaveBeenCalled()
    expect([...change.specDependsOn.get('default:auth/login')!]).toEqual(['default:auth/shared'])
  })

  it('removes an invalid stored dependency value as given', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['!!!bad!!!', 'default:auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      remove: ['!!!bad!!!'],
    })

    expect(result.dependsOn).toEqual(['default:auth/shared'])
  })

  it('throws when specId is not in change.specIds', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'unknown/spec', add: ['default:x'] }),
    ).rejects.toThrow(/not in change/)
  })

  it('throws when change not found', async () => {
    const repo = makeChangeRepository([])
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'nonexistent', specId: 'auth/login', add: ['default:x'] }),
    ).rejects.toThrow(/not found/)
  })

  it('throws when no operation specified', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    await expect(uc.execute({ name: 'my-change', specId: 'auth/login' })).rejects.toThrow(
      /at least one/,
    )
  })

  it('throws when removing a dep not in current list', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    await expect(
      uc.execute({ name: 'my-change', specId: 'auth/login', remove: ['default:unknown'] }),
    ).rejects.toThrow(/not found in current deps/)
  })

  it('does not add duplicate deps', async () => {
    const change = makeChange('my-change', { specIds: ['default:auth/login'] })
    change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
    const repo = makeChangeRepository([change])
    const uc = makeUc(repo)

    const result = await uc.execute({
      name: 'my-change',
      specId: 'auth/login',
      add: ['auth/shared', 'auth/jwt'],
    })

    expect(result.dependsOn).toEqual(['default:auth/shared', 'default:auth/jwt'])
  })

  describe('audit hardening', () => {
    it('set: [] clears all dependencies', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/shared'])
      const repo = makeChangeRepository([change])
      const uc = makeUc(repo)

      const result = await uc.execute({ name: 'my-change', specId: 'auth/login', set: [] })

      expect(result.dependsOn).toEqual([])
      expect([...change.specDependsOn.get('default:auth/login')!]).toEqual([])
    })

    it('handles an absent specDependsOn entry on add', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = makeUc(repo)

      expect(change.specDependsOn.get('default:auth/login')).toBeUndefined()
      const result = await uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        add: ['auth/jwt'],
      })

      expect(result.dependsOn).toEqual(['default:auth/jwt'])
    })

    it('clear on an empty list succeeds', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = makeUc(repo)

      const result = await uc.execute({ name: 'my-change', specId: 'auth/login', clear: true })

      expect(result.dependsOn).toEqual([])
    })

    it('raises INVALID_INPUT for mutually exclusive operations', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      const uc = makeUc(makeChangeRepository([change]))

      const err = await uc
        .execute({ name: 'my-change', specId: 'auth/login', set: ['a'], clear: true })
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(InvalidInputError)
      expect((err as InvalidInputError).code).toBe('INVALID_INPUT')
    })

    it('remove with a bare ID removes the qualified entry', async () => {
      const change = makeChange('my-change', { specIds: ['default:auth/login'] })
      change.setSpecDependsOn('default:auth/login', ['default:auth/jwt', 'default:auth/shared'])
      const uc = makeUc(makeChangeRepository([change]))

      const result = await uc.execute({
        name: 'my-change',
        specId: 'auth/login',
        remove: ['auth/jwt'],
      })

      expect(result.dependsOn).toEqual(['default:auth/shared'])
    })
  })
})
