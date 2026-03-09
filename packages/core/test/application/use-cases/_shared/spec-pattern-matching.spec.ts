import { describe, it, expect } from 'vitest'
import { listMatchingSpecs } from '../../../../src/application/use-cases/_shared/spec-pattern-matching.js'
import { type ContextWarning } from '../../../../src/application/use-cases/_shared/context-warning.js'
import { makeSpecRepository } from '../helpers.js'
import { Spec } from '../../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../../src/domain/value-objects/spec-path.js'

function makeSpec(capPath: string): Spec {
  return new Spec('default', SpecPath.parse(capPath), [])
}

describe('listMatchingSpecs', () => {
  it('bare * with allWorkspacesOnBareStar matches all workspaces', async () => {
    const repo1 = makeSpecRepository({ specs: [makeSpec('auth/login')] })
    const repo2 = makeSpecRepository({ specs: [makeSpec('billing/plan')] })
    const specs = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('*', 'default', true, specs, warnings)

    expect(results).toHaveLength(2)
    expect(results).toContainEqual({ workspace: 'default', capPath: 'auth/login' })
    expect(results).toContainEqual({ workspace: 'billing', capPath: 'billing/plan' })
    expect(warnings).toHaveLength(0)
  })

  it('bare * without allWorkspacesOnBareStar matches only default workspace', async () => {
    const repo1 = makeSpecRepository({ specs: [makeSpec('auth/login')] })
    const repo2 = makeSpecRepository({ specs: [makeSpec('billing/plan')] })
    const specs = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('*', 'default', false, specs, warnings)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ workspace: 'default', capPath: 'auth/login' })
  })

  it('workspace:* matches only named workspace', async () => {
    const repo1 = makeSpecRepository({ specs: [makeSpec('auth/login')] })
    const repo2 = makeSpecRepository({ specs: [makeSpec('billing/plan')] })
    const specs = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('billing:*', 'default', true, specs, warnings)

    expect(results).toEqual([{ workspace: 'billing', capPath: 'billing/plan' }])
  })

  it('prefix/* matches specs under prefix', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login'), makeSpec('auth/signup'), makeSpec('billing/plan')],
    })
    const specs = new Map([['default', repo]])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('auth/*', 'default', false, specs, warnings)

    expect(results).toHaveLength(2)
    expect(results).toContainEqual({ workspace: 'default', capPath: 'auth/login' })
    expect(results).toContainEqual({ workspace: 'default', capPath: 'auth/signup' })
  })

  it('exact path matches a single spec', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login'), makeSpec('auth/signup')],
    })
    const specs = new Map([['default', repo]])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('auth/login', 'default', false, specs, warnings)

    expect(results).toEqual([{ workspace: 'default', capPath: 'auth/login' }])
  })

  it('unknown workspace emits warning and returns empty', async () => {
    const specs = new Map([['default', makeSpecRepository()]])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('unknown:*', 'default', true, specs, warnings)

    expect(results).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.type).toBe('unknown-workspace')
    expect(warnings[0]!.path).toBe('unknown')
  })

  it('missing spec emits warning and returns empty', async () => {
    const repo = makeSpecRepository({ specs: [] })
    const specs = new Map([['default', repo]])
    const warnings: ContextWarning[] = []

    const results = await listMatchingSpecs('no/such', 'default', false, specs, warnings)

    expect(results).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.type).toBe('missing-spec')
  })
})
