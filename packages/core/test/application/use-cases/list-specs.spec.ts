import { describe, it, expect } from 'vitest'
import { ListSpecs } from '../../../src/application/use-cases/list-specs.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository, makeListWorkspaces } from './helpers.js'

describe('ListSpecs', () => {
  it('lists specs from all workspaces', async () => {
    const spec1 = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('billing', SpecPath.parse('payments/stripe'), ['spec.md'])

    const repo1 = makeSpecRepository({ specs: [spec1] })
    const repo2 = makeSpecRepository({ specs: [spec2] })

    const specRepos = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])

    const uc = new ListSpecs(makeListWorkspaces(specRepos))
    const result = await uc.execute()

    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.workspace).toBe('default')
    expect(result.items[0]!.path).toBe('auth/login')
    expect(result.items[1]!.workspace).toBe('billing')
    expect(result.items[1]!.path).toBe('payments/stripe')
    expect(result.byWorkspace).toHaveLength(2)
  })

  it('returns empty result when no specs exist', async () => {
    const repo = makeSpecRepository({ specs: [] })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(makeListWorkspaces(specRepos))
    const result = await uc.execute()

    expect(result.items).toEqual([])
    expect(result.meta.total).toBe(0)
  })

  it('includes workspace name in entries', async () => {
    const spec = new Spec('billing', SpecPath.parse('invoices'), ['spec.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['billing', repo]])

    const uc = new ListSpecs(makeListWorkspaces(specRepos))
    const result = await uc.execute()

    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.workspace).toBe('billing')
  })

  it('uses repository-provided title from list entries', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(makeListWorkspaces(specRepos))
    const result = await uc.execute()

    expect(result.items[0]!.title).toBe('login')
  })

  it('forwards includeMetadataStatus to repositories', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(makeListWorkspaces(specRepos))
    const result = await uc.execute({ includeMetadataStatus: true })

    expect(result.items[0]!.title).toBe('login')
  })

  describe('workspace filtering', () => {
    it('filters to a single workspace', async () => {
      const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
      const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])

      const repo1 = makeSpecRepository({ specs: [spec1], workspace: 'alpha' })
      const repo2 = makeSpecRepository({ specs: [spec2], workspace: 'beta' })

      const specRepos = new Map([
        ['alpha', repo1],
        ['beta', repo2],
      ])

      const uc = new ListSpecs(makeListWorkspaces(specRepos))
      const result = await uc.execute({ workspaces: ['alpha'] })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.workspace).toBe('alpha')
      expect(result.items[0]!.path).toBe('auth/login')
    })

    it('filters to multiple workspaces', async () => {
      const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
      const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])
      const spec3 = new Spec('gamma', SpecPath.parse('search/index'), ['spec.md'])

      const repo1 = makeSpecRepository({ specs: [spec1], workspace: 'alpha' })
      const repo2 = makeSpecRepository({ specs: [spec2], workspace: 'beta' })
      const repo3 = makeSpecRepository({ specs: [spec3], workspace: 'gamma' })

      const specRepos = new Map([
        ['alpha', repo1],
        ['beta', repo2],
        ['gamma', repo3],
      ])

      const uc = new ListSpecs(makeListWorkspaces(specRepos))
      const result = await uc.execute({ workspaces: ['alpha', 'gamma'] })

      expect(result.items).toHaveLength(2)
      expect(result.items.map((r) => r.workspace).sort()).toEqual(['alpha', 'gamma'])
    })

    it('returns empty when workspace does not exist', async () => {
      const spec = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
      const repo = makeSpecRepository({ specs: [spec], workspace: 'alpha' })

      const specRepos = new Map([['alpha', repo]])
      const uc = new ListSpecs(makeListWorkspaces(specRepos))
      const result = await uc.execute({ workspaces: ['nonexistent'] })

      expect(result.items).toEqual([])
    })

    it('returns all workspaces when filter is empty array', async () => {
      const spec1 = new Spec('alpha', SpecPath.parse('auth/login'), ['spec.md'])
      const spec2 = new Spec('beta', SpecPath.parse('billing/pay'), ['spec.md'])

      const repo1 = makeSpecRepository({ specs: [spec1], workspace: 'alpha' })
      const repo2 = makeSpecRepository({ specs: [spec2], workspace: 'beta' })

      const specRepos = new Map([
        ['alpha', repo1],
        ['beta', repo2],
      ])

      const uc = new ListSpecs(makeListWorkspaces(specRepos))
      const result = await uc.execute({ workspaces: [] })

      expect(result.items).toHaveLength(2)
    })
  })
})
