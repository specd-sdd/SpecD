import { describe, expect, it } from 'vitest'
import { makeSpec } from '../../../helpers/make-spec.js'
import { Spec } from '../../../../src/domain/entities/spec.js'
import { SpecArtifact } from '../../../../src/domain/value-objects/spec-artifact.js'
import { SpecPath } from '../../../../src/domain/value-objects/spec-path.js'
import { type SpecLockData } from '../../../../src/domain/services/parse-spec-lock.js'
import {
  type SpecPublication,
  type ResolveFromPathResult,
  type SpecSearchResult,
  SpecRepository,
  type ArtifactMeta,
} from '../../../../src/application/ports/spec-repository.js'
import {
  type MetadataSnapshot,
  type SpecMetadata,
} from '../../../../src/domain/services/parse-metadata.js'
import {
  type PersistedSpecState,
  type PersistedSpecStateSnapshot,
} from '../../../../src/domain/services/apply-persisted-spec-state-patch.js'
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
    return makeSpec({ workspace: this.workspace(), name: key, filenames: [] })
  }

  override async list(_prefix?: SpecPath) {
    return { items: [], meta: { total: 0, count: 0, limit: 100 } }
  }

  override async reindex(): Promise<void> {}

  override async count(): Promise<number> {
    return this._knownSpecs.size
  }

  override async persistedStateMeta(
    _spec: Spec,
    options?: import('../../../../src/application/ports/spec-repository.js').SpecMetaOptions,
  ): Promise<
    import('../../../../src/application/ports/spec-repository.js').PersistedStateMeta | null
  > {
    return options?.includeHash === true
      ? { lastModified: new Date().toISOString(), hash: 'sha256:test' }
      : { lastModified: new Date().toISOString() }
  }

  override async generatedMetadataMeta(): Promise<
    import('../../../../src/application/ports/spec-repository.js').GeneratedMetadataMeta | null
  > {
    return null
  }

  override async specFingerprint(_spec: Spec): Promise<string> {
    return 'sha256:test-spec-fingerprint'
  }

  override async readPersistedState(_spec: Spec): Promise<PersistedSpecStateSnapshot | null> {
    return null
  }

  override async writePersistedState(
    _spec: Spec,
    state: PersistedSpecState,
    _options: { readonly expectedRevision: string | null },
  ): Promise<PersistedSpecStateSnapshot> {
    return { ...state, originalHash: 'sha256:test' }
  }

  override async artifactMeta(_spec: Spec, _filename: string): Promise<ArtifactMeta | null> {
    return null
  }

  override async readMetadataSnapshot(_spec: Spec): Promise<MetadataSnapshot> {
    return { kind: 'missing', revision: null }
  }

  override async writeMetadataSnapshot(
    _spec: Spec,
    metadata: SpecMetadata,
    _options: { readonly expectedRevision: string | null },
  ): Promise<MetadataSnapshot> {
    return { kind: 'present', metadata, revision: 'sha256:test' }
  }

  override async search(_query: string): Promise<SpecSearchResult[]> {
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

  override async publish(_spec: Spec, _publication: SpecPublication): Promise<void> {}

  override async delete(_spec: Spec): Promise<void> {}

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
