import { describe, expect, it } from 'vitest'
import { Spec } from '../../../../src/domain/entities/spec.js'
import { SpecArtifact } from '../../../../src/domain/value-objects/spec-artifact.js'
import { SpecPath } from '../../../../src/domain/value-objects/spec-path.js'
import {
  type ResolveFromPathResult,
  SpecRepository,
} from '../../../../src/application/ports/spec-repository.js'
import {
  createSpecReferenceResolver,
  type SpecWorkspaceRoute,
} from '../../../../src/application/use-cases/_shared/spec-reference-resolver.js'

class FakeSpecRepository extends SpecRepository {
  private readonly _resolveResult: ResolveFromPathResult | null
  private readonly _knownSpecs: Set<string>

  constructor(
    workspace: string,
    resolveResult: ResolveFromPathResult | null,
    knownSpecs: readonly string[] = [],
  ) {
    super({ workspace, ownership: 'owned', isExternal: false, configPath: '/test' })
    this._resolveResult = resolveResult
    this._knownSpecs = new Set(knownSpecs)
  }

  override async get(name: SpecPath): Promise<Spec | null> {
    const key = name.toString()
    if (!this._knownSpecs.has(key)) return null
    return new Spec(this.workspace(), SpecPath.parse(key), [])
  }

  override async list(_prefix?: SpecPath): Promise<Spec[]> {
    return []
  }

  override async artifact(_spec: Spec, _filename: string): Promise<SpecArtifact | null> {
    return null
  }

  override async save(
    _spec: Spec,
    _artifact: SpecArtifact,
    _options?: { force?: boolean },
  ): Promise<void> {}

  override async delete(_spec: Spec): Promise<void> {}

  override async metadata(
    _spec: Spec,
  ): Promise<import('../../../../src/domain/services/parse-metadata.js').SpecMetadata | null> {
    return null
  }

  override async saveMetadata(
    _spec: Spec,
    _content: string,
    _options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {}

  override async resolveFromPath(
    _inputPath: string,
    _from?: SpecPath,
  ): Promise<ResolveFromPathResult | null> {
    return this._resolveResult
  }
}

describe('createSpecReferenceResolver', () => {
  it('resolves same-workspace references directly from origin repository', async () => {
    const originResolve: ResolveFromPathResult = {
      specPath: SpecPath.parse('core/storage'),
      specId: 'core:core/storage',
    }
    const repositories = new Map([['core', new FakeSpecRepository('core', originResolve)]])
    const routes: readonly SpecWorkspaceRoute[] = [{ workspace: 'core', prefixSegments: ['core'] }]

    const resolver = createSpecReferenceResolver({
      originWorkspace: 'core',
      originSpecPath: SpecPath.parse('core/change'),
      repositories,
      workspaceRoutes: routes,
    })

    await expect(resolver('../storage/spec.md')).resolves.toBe('core:core/storage')
  })

  it('routes _global cross-workspace hints by prefix', async () => {
    const repositories = new Map([
      [
        'core',
        new FakeSpecRepository('core', {
          crossWorkspaceHint: ['_global', 'architecture'],
        }),
      ],
      ['default', new FakeSpecRepository('default', null, ['_global/architecture'])],
    ])
    const routes: readonly SpecWorkspaceRoute[] = [
      { workspace: 'default', prefixSegments: ['_global'] },
      { workspace: 'core', prefixSegments: ['core'] },
    ]

    const resolver = createSpecReferenceResolver({
      originWorkspace: 'core',
      originSpecPath: SpecPath.parse('core/actor-resolver-port'),
      repositories,
      workspaceRoutes: routes,
    })

    await expect(resolver('../../_global/architecture/spec.md')).resolves.toBe(
      'default:_global/architecture',
    )
  })

  it('routes no-prefix workspaces using explicit workspace selector segment', async () => {
    const repositories = new Map([
      [
        'default',
        new FakeSpecRepository('default', {
          crossWorkspaceHint: ['billing', 'invoices', 'create'],
        }),
      ],
      ['billing', new FakeSpecRepository('billing', null, ['invoices/create'])],
    ])
    const routes: readonly SpecWorkspaceRoute[] = [
      { workspace: 'default', prefixSegments: ['_global'] },
      { workspace: 'billing', prefixSegments: [] },
    ]

    const resolver = createSpecReferenceResolver({
      originWorkspace: 'default',
      originSpecPath: SpecPath.parse('_global/architecture'),
      repositories,
      workspaceRoutes: routes,
    })

    await expect(resolver('../../billing/invoices/create/spec.md')).resolves.toBe(
      'billing:invoices/create',
    )
  })

  it('returns null when hinted target spec does not exist', async () => {
    const repositories = new Map([
      [
        'core',
        new FakeSpecRepository('core', {
          crossWorkspaceHint: ['_global', 'missing-spec'],
        }),
      ],
      ['default', new FakeSpecRepository('default', null, [])],
    ])
    const routes: readonly SpecWorkspaceRoute[] = [
      { workspace: 'default', prefixSegments: ['_global'] },
      { workspace: 'core', prefixSegments: ['core'] },
    ]

    const resolver = createSpecReferenceResolver({
      originWorkspace: 'core',
      originSpecPath: SpecPath.parse('core/change'),
      repositories,
      workspaceRoutes: routes,
    })

    await expect(resolver('../../_global/missing-spec/spec.md')).resolves.toBeNull()
  })

  it('returns null for ambiguous escaped hints without explicit workspace selector', async () => {
    const repositories = new Map([
      [
        'default',
        new FakeSpecRepository('default', {
          crossWorkspaceHint: ['shared', 'feature'],
        }),
      ],
      ['billing', new FakeSpecRepository('billing', null, ['shared/feature'])],
      ['sales', new FakeSpecRepository('sales', null, ['shared/feature'])],
    ])
    const routes: readonly SpecWorkspaceRoute[] = [
      { workspace: 'billing', prefixSegments: [] },
      { workspace: 'sales', prefixSegments: [] },
    ]

    const resolver = createSpecReferenceResolver({
      originWorkspace: 'default',
      originSpecPath: SpecPath.parse('_global/architecture'),
      repositories,
      workspaceRoutes: routes,
    })

    await expect(resolver('../../shared/feature/spec.md')).resolves.toBeNull()
  })
})
