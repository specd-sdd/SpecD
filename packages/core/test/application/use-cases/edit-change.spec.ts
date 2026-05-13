import { describe, it, expect, vi } from 'vitest'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { SpecNotInChangeError } from '../../../src/application/errors/spec-not-in-change-error.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  makeChangeRepository,
  makeActorResolver,
  makeChange,
  makeSpecRepository,
} from './helpers.js'

describe('EditChange', () => {
  describe('adding spec IDs', () => {
    it('adds spec IDs to the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.change.specIds).toContain('auth/login')
      expect(result.change.specIds).toContain('billing/pay')
    })

    it('does not duplicate spec IDs already present', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['auth/login'] })

      expect(result.change.specIds).toEqual(['auth/login'])
      expect(result.invalidated).toBe(false)
    })

    it('does not call unscaffold when adding specs', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const unscaffoldSpy = vi.spyOn(repo, 'unscaffold')
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(unscaffoldSpy).not.toHaveBeenCalled()
    })

    it('seeds new spec deps from sidecar when adding an existing spec', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('billing/pay'), ['spec.md'])],
        artifacts: {
          'billing/pay/spec-lock.json': JSON.stringify({
            schema: { name: 'schema-std', version: 1 },
            dependsOn: ['core:storage'],
          }),
        },
      })
      const uc = new EditChange(repo, new Map([['default', specRepo]]), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.change.specDependsOn.get('billing/pay')).toEqual(['core:storage'])
    })

    it('falls back to metadata when sidecar is absent', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('billing/pay'), ['spec.md'])],
        artifacts: {
          'billing/pay/.specd-metadata.yaml': JSON.stringify({
            dependsOn: ['core:change-manifest'],
          }),
        },
      })
      const uc = new EditChange(repo, new Map([['default', specRepo]]), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.change.specDependsOn.get('billing/pay')).toEqual(['core:change-manifest'])
    })

    it('does not overwrite an existing in-change dependency snapshot', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'billing/pay'] })
      change.setSpecDependsOn('billing/pay', ['core:existing'])
      const repo = makeChangeRepository([change])
      const specRepo = makeSpecRepository({
        specs: [new Spec('default', SpecPath.parse('core/config'), ['spec.md'])],
      })
      const uc = new EditChange(repo, new Map([['default', specRepo]]), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.change.specDependsOn.get('billing/pay')).toEqual(['core:existing'])
    })
  })

  describe('removing spec IDs', () => {
    it('removes spec IDs from the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'billing/pay'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay'] })

      expect(result.change.specIds).toEqual(['auth/login'])
    })

    it('throws SpecNotInChangeError when removing a spec not in the change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await expect(
        uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay'] }),
      ).rejects.toThrow(SpecNotInChangeError)
    })

    it('calls unscaffold with the removed spec IDs', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login', 'billing/pay'] })
      const repo = makeChangeRepository([change])
      const unscaffoldSpy = vi.spyOn(repo, 'unscaffold')
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay'] })

      expect(unscaffoldSpy).toHaveBeenCalledOnce()
      expect(unscaffoldSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-change', specIds: ['auth/login'] }),
        ['billing/pay'],
      )
    })

    it('calls unscaffold with all removed spec IDs when removing multiple', async () => {
      const change = makeChange('my-change', {
        specIds: ['auth/login', 'billing/pay', 'core/config'],
      })
      const repo = makeChangeRepository([change])
      const unscaffoldSpy = vi.spyOn(repo, 'unscaffold')
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await uc.execute({ name: 'my-change', removeSpecIds: ['billing/pay', 'core/config'] })

      expect(unscaffoldSpy).toHaveBeenCalledOnce()
      expect(unscaffoldSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-change', specIds: ['auth/login'] }),
        ['billing/pay', 'core/config'],
      )
    })
  })

  describe('when the change does not exist', () => {
    it('throws ChangeNotFoundError', async () => {
      const repo = makeChangeRepository()
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await expect(uc.execute({ name: 'missing', addSpecIds: ['auth/login'] })).rejects.toThrow(
        ChangeNotFoundError,
      )
    })
  })

  describe('when the edit removes all specIds', () => {
    it('allows removing all specIds', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', removeSpecIds: ['auth/login'] })

      expect(result.change.specIds).toEqual([])
      expect(result.change.workspaces).toEqual([])
      expect(result.invalidated).toBe(true)
    })
  })

  describe('saving', () => {
    it('saves the updated change to the repository', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      const saved = repo.store.get('my-change')
      expect(saved).toBeDefined()
      expect(saved!.specIds).toContain('billing/pay')
    })

    it('persists the specIds update through ChangeRepository.mutate', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const mutateSpy = vi.spyOn(repo, 'mutate')
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(mutateSpy).toHaveBeenCalledOnce()
      expect(mutateSpy).toHaveBeenCalledWith('my-change', expect.any(Function))
    })
  })

  describe('invalidation', () => {
    it('returns invalidated=true when specIds actually changed', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['billing/pay'] })

      expect(result.invalidated).toBe(true)
    })

    it('returns invalidated=false when no add or remove is provided', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change' })

      expect(result.invalidated).toBe(false)
    })

    it('returns invalidated=false when specIds did not change', async () => {
      const change = makeChange('my-change', { specIds: ['auth/login'] })
      const repo = makeChangeRepository([change])
      const uc = new EditChange(repo, new Map(), makeActorResolver())

      const result = await uc.execute({ name: 'my-change', addSpecIds: ['auth/login'] })

      expect(result.invalidated).toBe(false)
    })
  })
})
