import { describe, it, expect } from 'vitest'
import { traverseDependsOn } from '../../../../src/application/use-cases/_shared/depends-on-traversal.js'
import { type ContextWarning } from '../../../../src/application/use-cases/_shared/context-warning.js'
import { type ResolvedSpec } from '../../../../src/application/use-cases/_shared/spec-pattern-matching.js'
import { makeSpecRepository } from '../helpers.js'
import { Spec } from '../../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../../src/domain/value-objects/spec-path.js'
import { stringify } from 'yaml'

function makeSpec(capPath: string): Spec {
  return new Spec('default', SpecPath.parse(capPath), ['.specd-metadata.yaml'])
}

function metadataYaml(dependsOn: string[]): string {
  return stringify({ dependsOn })
}

describe('traverseDependsOn', () => {
  it('adds discovered dependency specs', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login'), makeSpec('auth/shared')],
      artifacts: {
        'auth/login/.specd-metadata.yaml': metadataYaml(['auth/shared']),
      },
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>()
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'auth/login',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      undefined,
      0,
    )

    expect(added.has('default:auth/login')).toBe(true)
    expect(added.has('default:auth/shared')).toBe(true)
    expect(warnings).toHaveLength(0)
  })

  it('detects cycles and emits warning', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('a/one'), makeSpec('a/two')],
      artifacts: {
        'a/one/.specd-metadata.yaml': metadataYaml(['a/two']),
        'a/two/.specd-metadata.yaml': metadataYaml(['a/one']),
      },
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>()
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'a/one',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      undefined,
      0,
    )

    // a/two tries to traverse back to a/one → cycle detected
    const cycleWarning = warnings.find((w) => w.type === 'cycle')
    expect(cycleWarning).toBeDefined()
    expect(cycleWarning!.path).toBe('default:a/one')
  })

  it('respects maxDepth', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('a/one'), makeSpec('a/two'), makeSpec('a/three')],
      artifacts: {
        'a/one/.specd-metadata.yaml': metadataYaml(['a/two']),
        'a/two/.specd-metadata.yaml': metadataYaml(['a/three']),
      },
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>()
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'a/one',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      1,
      0,
    )

    // depth=1 means: traverse a/one (depth 0), follow to a/two (depth 1), but stop there
    expect(added.has('default:a/one')).toBe(true)
    expect(added.has('default:a/two')).toBe(true)
    expect(added.has('default:a/three')).toBe(false)
  })

  it('does not re-add specs already in includedSpecs', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login'), makeSpec('auth/shared')],
      artifacts: {
        'auth/login/.specd-metadata.yaml': metadataYaml(['auth/shared']),
      },
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>([
      ['default:auth/shared', { workspace: 'default', capPath: 'auth/shared' }],
    ])
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'auth/login',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      undefined,
      0,
    )

    // auth/shared was already included, so it should NOT appear in dependsOnAdded
    expect(added.has('default:auth/shared')).toBe(false)
    expect(added.has('default:auth/login')).toBe(true)
  })

  it('emits warning for unknown workspace in dependency', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login')],
      artifacts: {
        'auth/login/.specd-metadata.yaml': metadataYaml(['unknown:something']),
      },
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>()
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'auth/login',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      undefined,
      0,
    )

    const wsWarning = warnings.find((w) => w.type === 'unknown-workspace')
    expect(wsWarning).toBeDefined()
    expect(wsWarning!.path).toBe('unknown')
  })

  it('skips spec with no metadata artifact', async () => {
    const repo = makeSpecRepository({
      specs: [makeSpec('auth/login')],
      artifacts: {},
    })
    const specs = new Map([['default', repo]])
    const included = new Map<string, ResolvedSpec>()
    const added = new Map<string, ResolvedSpec>()
    const seen = new Set<string>()
    const warnings: ContextWarning[] = []

    await traverseDependsOn(
      'default',
      'auth/login',
      included,
      added,
      seen,
      new Set(),
      specs,
      warnings,
      undefined,
      0,
    )

    // Still adds the spec itself but doesn't recurse further
    expect(added.has('default:auth/login')).toBe(true)
    expect(warnings).toHaveLength(0)
  })
})
