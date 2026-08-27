import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { type GetSpecMetadata } from '../../../src/application/use-cases/get-spec-metadata.js'
import { type MaterializeSpecMetadata } from '../../../src/application/use-cases/materialize-spec-metadata.js'
import { makeSnapshotGetSpecMetadata } from '../../helpers/make-cached-get-spec-metadata.js'
import {
  Change,
  type ActorIdentity,
  type CreatedEvent,
} from '../../../src/domain/entities/change.js'
import { type ArchivedChange } from '../../../src/domain/entities/archived-change.js'
import { type Spec } from '../../../src/domain/entities/spec.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import {
  ArtifactType,
  type ArtifactTypeProps,
} from '../../../src/domain/value-objects/artifact-type.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import { ChangeRepository } from '../../../src/application/ports/change-repository.js'
import {
  type ActiveChangeListOptions,
  type DiscardedChangeListOptions,
  type DraftedChangeListOptions,
  type MutateResult,
} from '../../../src/application/ports/change-repository.js'
import { ChangeAlreadyExistsError } from '../../../src/application/errors/change-already-exists-error.js'
import {
  type SpecPublication,
  type SpecListEntry,
  type SpecListOptions,
  SpecRepository,
  type ArtifactMeta,
  type GeneratedMetadataMeta,
  type PersistedStateMeta,
  type SpecMetaOptions,
  type ResolveFromPathResult,
  type SpecSearchResult,
} from '../../../src/application/ports/spec-repository.js'
import {
  type MetadataSnapshot,
  type SpecMetadata,
} from '../../../src/domain/services/parse-metadata.js'
import { SpecMetadataParseError } from '../../../src/domain/errors/spec-metadata-parse-error.js'
import {
  type PersistedSpecState,
  type PersistedSpecStateSnapshot,
} from '../../../src/domain/services/apply-persisted-spec-state-patch.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
  type ArchivePathEntry,
} from '../../../src/application/ports/archive-repository.js'
import { type ListResult } from '../../../src/application/ports/repository.js'
import {
  paginateActiveChanges,
  paginateDiscardedChanges,
  paginateDraftedChanges,
  toActiveChangeListEntry,
  toDiscardedChangeListEntry,
  toDraftedChangeListEntry,
} from '../../../src/infrastructure/fs/change-list-projection.js'
import { paginateList } from '../../../src/infrastructure/fs/list-pagination.js'
import { type ArchiveListEntry } from '../../../src/domain/archived-change-index-entry.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactAST,
  type ArtifactNode,
} from '../../../src/application/ports/artifact-parser.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { type ContentHasher } from '../../../src/application/ports/content-hasher.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import {
  type RunStepHooks,
  type RunStepHooksResult,
} from '../../../src/application/use-cases/run-step-hooks.js'
import { type ActorResolver } from '../../../src/application/ports/actor-resolver.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import {
  toDiscardedChangeView,
  toDraftedChangeView,
  type DiscardedChangeView,
  type DraftedChangeView,
} from '../../../src/domain/read-only-change-view.js'
import {
  ListWorkspaces,
  type ProjectWorkspace,
} from '../../../src/application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { type PreviewSpec } from '../../../src/application/use-cases/preview-spec.js'
import { type GetActiveSchema } from '../../../src/application/use-cases/get-active-schema.js'
import { type DetectOverlap } from '../../../src/application/use-cases/detect-overlap.js'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { OverlapReport } from '../../../src/domain/value-objects/overlap-report.js'
import { type MetadataExtraction } from '../../../src/domain/value-objects/metadata-extraction.js'
import { type CrossArtifactValidationRule } from '../../../src/domain/value-objects/cross-artifact-validation.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { type HookRunner } from '../../../src/application/ports/hook-runner.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'

/** Default identity for test actors. */
export const testActor: ActorIdentity = { name: 'Test User', email: 'test@example.com' }

/**
 * Creates a mock `Change` entity.
 */
export function makeChange(
  name: string,
  overrides: Partial<import('../../../src/domain/entities/change.js').ChangeProps> = {},
  schemaName: string = 'test-schema',
): Change {
  const createdAt = overrides.createdAt ?? new Date()
  const specIds = overrides.specIds ?? []
  const created: CreatedEvent = {
    type: 'created',
    at: createdAt,
    by: testActor,
    specIds,
    schemaName,
    schemaVersion: 1,
  }

  return new Change({
    name,
    createdAt,
    specIds,
    history: [created],
    ...overrides,
  })
}

/**
 * Stub implementation of `ChangeRepository` for testing.
 *
 * `mutate` / `mutateDraft` persist the callback aggregate and return
 * `{ result, change }` from the in-memory store. They do **not** simulate
 * filesystem drift reclassification — use `FsChangeRepository` integration
 * tests for post-reconcile drift semantics.
 */
export class StubChangeRepository extends ChangeRepository {
  readonly store = new Map<string, Change>()

  constructor(initial: Change[] = []) {
    super({ workspace: 'test', ownership: 'owned', isExternal: false, configPath: '/tmp' })
    for (const c of initial) {
      this.store.set(c.name, c)
    }
  }

  async get(name: string): Promise<Change | null> {
    const change = this.store.get(name)
    if (!change || change.isDrafted || isDiscardedStub(change)) return null
    return change
  }

  async getDraft(name: string): Promise<DraftedChangeView | null> {
    const change = this.store.get(name)
    if (!change || !change.isDrafted) return null
    return toDraftedChangeView(change)
  }

  async getDiscarded(name: string): Promise<DiscardedChangeView | null> {
    const change = this.store.get(name)
    if (!change || !isDiscardedStub(change)) return null
    return toDiscardedChangeView(change)
  }

  async create(change: Change): Promise<void> {
    if (this.store.has(change.name)) {
      throw new ChangeAlreadyExistsError(change.name)
    }
    this.store.set(change.name, change)
  }

  private async _persist(change: Change): Promise<void> {
    change.touchUpdatedAt()
    this.store.set(change.name, change)
  }

  async delete(change: Change): Promise<void> {
    this.store.delete(change.name)
  }

  async list(options?: ActiveChangeListOptions) {
    const entries = Array.from(this.store.values())
      .filter((c) => !c.isDrafted && !isDiscardedStub(c))
      .map((c) => toActiveChangeListEntry(c, options))
    return paginateActiveChanges(entries, options)
  }

  async listDrafts(options?: DraftedChangeListOptions) {
    const entries = Array.from(this.store.values())
      .filter((c) => c.isDrafted)
      .map((c) => toDraftedChangeListEntry(c, options))
      .filter((e): e is NonNullable<typeof e> => e !== null)
    return paginateDraftedChanges(entries, options)
  }

  async listDiscarded(options?: DiscardedChangeListOptions) {
    const entries = Array.from(this.store.values())
      .filter((c) => isDiscardedStub(c))
      .map((c) => toDiscardedChangeListEntry(c, options))
      .filter((e): e is NonNullable<typeof e> => e !== null)
    return paginateDiscardedChanges(entries, options)
  }

  async count(): Promise<number> {
    return Array.from(this.store.values()).filter((c) => !c.isDrafted && !isDiscardedStub(c)).length
  }

  async countDrafts(): Promise<number> {
    return Array.from(this.store.values()).filter((c) => c.isDrafted).length
  }

  async countDiscarded(): Promise<number> {
    return Array.from(this.store.values()).filter((c) => isDiscardedStub(c)).length
  }

  async reindex(): Promise<void> {}
  async reindexActive(): Promise<void> {}
  async reindexDrafts(): Promise<void> {}
  async reindexDiscarded(): Promise<void> {}

  async mutate<T>(name: string, fn: (c: Change) => Promise<T> | T): Promise<MutateResult<T>> {
    const change = this.store.get(name)
    if (!change) throw new ChangeNotFoundError(name)
    const result = await fn(change)
    await this._persist(change)
    // Re-read from store to mirror MutateResult.change as the post-persist aggregate.
    // Drift reconcile is out of scope for this in-memory stub.
    const persisted = this.store.get(name)
    if (persisted === undefined) throw new ChangeNotFoundError(name)
    return { result, change: persisted }
  }

  override internalPaths(): readonly string[] {
    return ['/test/changes', '/test/drafts', '/test/discarded']
  }

  async mutateDraft<T>(name: string, fn: (c: Change) => Promise<T> | T): Promise<MutateResult<T>> {
    const change = this.store.get(name)
    if (!change) throw new ChangeNotFoundError(name)
    const result = await fn(change)
    await this._persist(change)
    const persisted = this.store.get(name)
    if (persisted === undefined) throw new ChangeNotFoundError(name)
    return { result, change: persisted }
  }

  async scaffold(
    _change: Change,
    _specExists: (specId: string) => Promise<boolean>,
  ): Promise<void> {}
  async unscaffold(_change: Change, _specIds: readonly string[]): Promise<void> {}
  changePath(change: Change): string {
    return `/test/changes/${change.name}`
  }
  draftChangePath(_view: DraftedChangeView): string {
    return `/test/drafts/${_view.name}`
  }
  async artifact(_change: Change, _filename: string): Promise<SpecArtifact | null> {
    return null
  }
  async saveArtifact(
    _change: Change,
    _artifact: SpecArtifact,
    _options?: { force?: boolean },
  ): Promise<void> {}
  async artifactExists(_change: Change, _filename: string): Promise<boolean> {
    return false
  }
  async deltaExists(_change: Change, _specId: string, _filename: string): Promise<boolean> {
    return false
  }
}

/**
 * Creates a fully-typed `ChangeRepository` backed by an in-memory map.
 */
export function makeChangeRepository(initial: Change[] = []): StubChangeRepository {
  return new StubChangeRepository(initial)
}

/**
 * @param change - Change to inspect
 * @returns Whether the latest history event is `discarded`
 */
function isDiscardedStub(change: Change): boolean {
  const last = change.history[change.history.length - 1]
  return last?.type === 'discarded'
}

/**
 * In-memory `SpecRepository` subclass for unit tests.
 */
export class StubSpecRepository extends SpecRepository {
  private readonly _specs: Spec[]
  private readonly _artifacts: Record<string, string | null>
  private readonly _resolveFromPath?: (
    inputPath: string,
    from?: SpecPath,
  ) => Promise<ResolveFromPathResult | null>
  readonly saved = new Map<string, string>()
  private _persistedState = new Map<string, PersistedSpecStateSnapshot>()
  private _metadataSnapshots = new Map<string, MetadataSnapshot>()

  constructor(opts: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    ownership?: 'owned' | 'shared' | 'readOnly'
    workspace?: string
    resolveFromPath?: (inputPath: string, from?: SpecPath) => Promise<ResolveFromPathResult | null>
  }) {
    super({
      workspace: opts.workspace ?? 'default',
      ownership: opts.ownership ?? 'owned',
      isExternal: false,
      configPath: '/test',
    })
    this._specs = opts.specs ?? []
    this._artifacts = opts.artifacts ?? {}
    if (opts.resolveFromPath !== undefined) {
      this._resolveFromPath = opts.resolveFromPath
    }
  }

  override async get(name: SpecPath): Promise<Spec | null> {
    return this._specs.find((s) => s.name.toString() === name.toString()) ?? null
  }

  override async list(prefix?: SpecPath, options?: SpecListOptions) {
    const filtered =
      prefix === undefined
        ? this._specs
        : this._specs.filter((s) => prefix.equals(s.name) || prefix.isAncestorOf(s.name))
    const entries: SpecListEntry[] = filtered.map((spec) => {
      const base: SpecListEntry = {
        workspace: spec.workspace,
        path: spec.name.toFsPath('/'),
        title: spec.name.toString().split('/').at(-1) ?? spec.name.toString(),
      }
      if (options?.includeMeta !== true) {
        return base
      }
      return {
        ...base,
        artifacts: [...spec.artifacts],
        persistedStateMeta: spec.persistedStateStamp.present
          ? { lastModified: spec.persistedStateStamp.lastModified! }
          : null,
        generatedMetadataMeta: spec.generatedMetadataStamp.present
          ? { lastModified: spec.generatedMetadataStamp.lastModified! }
          : null,
      }
    })
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))
    return paginateList(sorted, options, (item) => ({ key: item.path }))
  }

  override async count(): Promise<number> {
    return this._specs.length
  }

  override async reindex(): Promise<void> {}

  override async persistedStateMeta(
    _spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<PersistedStateMeta | null> {
    if (options?.includeHash === true) {
      return { lastModified: new Date().toISOString(), hash: 'sha256:test' }
    }
    return { lastModified: new Date().toISOString() }
  }

  override async generatedMetadataMeta(
    _spec: Spec,
    options?: SpecMetaOptions,
  ): Promise<GeneratedMetadataMeta | null> {
    return null
  }

  override async specFingerprint(_spec: Spec): Promise<string> {
    return 'sha256:test-spec-fingerprint'
  }

  override async artifact(_spec: Spec, filename: string): Promise<SpecArtifact | null> {
    const key = `${_spec.name.toString()}/${filename}`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    return new SpecArtifact(filename, content)
  }

  override async save(_spec: Spec, artifact: SpecArtifact): Promise<void> {
    this.saved.set(artifact.filename, artifact.content)
  }

  override async publish(spec: Spec, publication: SpecPublication): Promise<void> {
    for (const artifact of publication.artifacts) {
      this.saved.set(`${spec.name.toString()}/${artifact.filename}`, artifact.content)
      this.saved.set(artifact.filename, artifact.content)
    }
    const snapshot = await this.writePersistedState(spec, publication.persistedState, {
      expectedRevision: (await this.readPersistedState(spec))?.originalHash ?? null,
    })
    this._persistedState.set(spec.name.toString(), snapshot)
  }

  override async delete(): Promise<void> {}

  override async readPersistedState(spec: Spec): Promise<PersistedSpecStateSnapshot | null> {
    const stored = this._persistedState.get(spec.name.toString())
    if (stored !== undefined) return stored

    const key = `${spec.name.toString()}/spec-lock.json`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    try {
      const parsed = JSON.parse(content) as Omit<PersistedSpecStateSnapshot, 'originalHash'>
      return { ...parsed, originalHash: 'sha256:test-lock' }
    } catch {
      return null
    }
  }

  override async writePersistedState(
    spec: Spec,
    state: PersistedSpecState,
    options: { readonly expectedRevision: string | null },
  ): Promise<PersistedSpecStateSnapshot> {
    const current = await this.readPersistedState(spec)
    if (options.expectedRevision === null) {
      if (current !== null) {
        throw new Error('persisted state already exists')
      }
    } else if (current === null || current.originalHash !== options.expectedRevision) {
      throw new Error('persisted state revision mismatch')
    }

    const snapshot: PersistedSpecStateSnapshot = {
      ...state,
      originalHash: 'sha256:test-lock',
    }
    this._persistedState.set(spec.name.toString(), snapshot)
    const json = JSON.stringify({
      schema: state.schema,
      dependsOn: state.dependsOn,
      implementation: state.implementation,
      ...(state.optimizations !== undefined ? { optimizations: state.optimizations } : {}),
    })
    this._artifacts[`${spec.name.toString()}/spec-lock.json`] = json
    this.saved.set(`${spec.name.toString()}/spec-lock.json`, json)
    this.saved.set('spec-lock.json', json)
    return snapshot
  }

  override async artifactMeta(
    spec: Spec,
    filename: string,
    options?: SpecMetaOptions,
  ): Promise<ArtifactMeta | null> {
    const artifact = await this.artifact(spec, filename)
    if (artifact === null) return null
    const hasher = new NodeContentHasher()
    const lastModified = new Date().toISOString()
    if (options?.includeHash !== true) {
      return { lastModified }
    }
    return {
      lastModified,
      hash: artifact.originalHash ?? hasher.hash(artifact.content),
    }
  }

  override async readMetadataSnapshot(spec: Spec): Promise<MetadataSnapshot> {
    const stored = this._metadataSnapshots.get(spec.name.toString())
    if (stored !== undefined) return stored

    const jsonKey = `${spec.name.toString()}/metadata.json`
    const legacyKey = `${spec.name.toString()}/.specd-metadata.yaml`
    const content = this._artifacts[jsonKey] ?? this._artifacts[legacyKey]
    if (content === undefined || content === null) {
      return { kind: 'missing', revision: null }
    }

    try {
      const parsed = JSON.parse(content) as SpecMetadata
      return { kind: 'present', metadata: parsed, revision: 'sha256:test-metadata' }
    } catch {
      return {
        kind: 'invalid',
        revision: 'sha256:test-metadata',
        error: new SpecMetadataParseError(
          `${spec.workspace}:${spec.name.toString()}`,
          'invalid json',
        ),
      }
    }
  }

  override async writeMetadataSnapshot(
    spec: Spec,
    metadata: SpecMetadata,
    options: { readonly expectedRevision: string | null },
  ): Promise<MetadataSnapshot> {
    const current = await this.readMetadataSnapshot(spec)
    if (options.expectedRevision === null && current.kind !== 'missing') {
      throw new Error('metadata already exists')
    }
    if (options.expectedRevision !== null && current.revision !== options.expectedRevision) {
      throw new Error('metadata revision mismatch')
    }

    const content = JSON.stringify(metadata)
    this.saved.set('metadata.json', content)
    this.saved.set('.specd-metadata.yaml', content)
    this._artifacts[`${spec.name.toString()}/metadata.json`] = content
    const snapshot: MetadataSnapshot = {
      kind: 'present',
      metadata,
      revision: 'sha256:test-metadata',
    }
    this._metadataSnapshots.set(spec.name.toString(), snapshot)
    return snapshot
  }

  override async resolveFromPath(
    inputPath: string,
    from?: SpecPath,
  ): Promise<ResolveFromPathResult | null> {
    if (this._resolveFromPath !== undefined) {
      return this._resolveFromPath(inputPath, from)
    }

    // Handle canonical IDs
    if (inputPath.includes(':')) {
      const parts = inputPath.split(':')
      const ws = parts[0]!
      const capPath = parts.slice(1).join(':')
      if (ws === this.workspace()) {
        try {
          const specPath = SpecPath.parse(capPath)
          return { specPath, specId: inputPath }
        } catch {
          return null
        }
      }
      return { crossWorkspaceHint: [ws, ...capPath.split('/')] }
    }

    // Simple relative resolution for tests
    let resolvedPath: string
    let escapedWorkspace = false
    if (inputPath.startsWith('/')) {
      resolvedPath = inputPath.slice(1)
    } else if (from) {
      const segments = from.toString().split('/')
      const inputSegments = inputPath.split('/')
      const resultSegments = [...segments]

      for (const segment of inputSegments) {
        if (segment === '..') {
          if (resultSegments.length === 0) {
            escapedWorkspace = true
          } else {
            resultSegments.pop()
          }
        } else if (segment !== '.' && segment !== 'spec.md' && segment !== '.specd-metadata.yaml') {
          resultSegments.push(segment)
        }
      }
      resolvedPath = resultSegments.join('/')
    } else {
      resolvedPath = inputPath
    }

    if (escapedWorkspace) {
      const segments = resolvedPath.split('/').filter((s) => s.length > 0)
      return { crossWorkspaceHint: segments }
    }

    try {
      const specPath = SpecPath.parse(resolvedPath)
      const exists = this._specs.some((s) => s.name.toString() === specPath.toString())
      if (!exists) {
        return null
      }
      const specId = `${this.workspace()}:${specPath.toString()}`
      return { specPath, specId }
    } catch {
      return null
    }
  }

  override async search(): Promise<SpecSearchResult[]> {
    return []
  }
}

/**
 * Creates a `SpecRepository` backed by in-memory arrays.
 */
export function makeSpecRepository(
  opts:
    | {
        specs?: Spec[]
        artifacts?: Record<string, string | null>
        ownership?: 'owned' | 'shared' | 'readOnly'
        workspace?: string
        resolveFromPath?: (
          inputPath: string,
          from?: SpecPath,
        ) => Promise<ResolveFromPathResult | null>
      }
    | 'owned'
    | 'shared'
    | 'readOnly' = {},
): StubSpecRepository {
  const options = typeof opts === 'string' ? { ownership: opts } : opts
  return new StubSpecRepository(options)
}

/**
 * Creates a mock `ArchiveRepository`.
 */
export function makeArchiveRepository(initial: ArchivedChange[] = []): ArchiveRepository {
  return {
    async archive(change: Change) {
      return {
        archivedChange: {
          archivedName: change.name,
          archivedAt: new Date(),
          archivedBy: testActor,
        } as unknown as ArchivedChange,
        archiveDirPath: `/test/archive/${change.name}`,
      }
    },
    async list(_options?: ArchiveListOptions): Promise<ListResult<ArchiveListEntry>> {
      const items: ArchiveListEntry[] = initial.map((c) => ({
        name: c.name,
        archivedName: c.archivedName,
        archivedAt: c.archivedAt,
        specIds: [...c.specIds],
        schemaName: c.schemaName,
        schemaVersion: c.schemaVersion,
      }))
      const sorted = [...items].sort(
        (a, b) => b.archivedAt.getTime() - a.archivedAt.getTime() || a.name.localeCompare(b.name),
      )
      return paginateList(sorted, _options, (item) => ({
        key: item.archivedAt.toISOString(),
        id: item.name,
      }))
    },
    async count(): Promise<number> {
      return initial.length
    },
    async get(name: string): Promise<ArchivedChange | null> {
      return initial.find((c) => c.archivedName === name) ?? null
    },
    archivePath(entry: ArchivePathEntry) {
      return `/test/archive/${entry.archivedName}`
    },
    async reindex(): Promise<void> {},
    internalPaths(): readonly string[] {
      return ['/test/archive']
    },
  } as unknown as ArchiveRepository
}

/**
 * Creates a mock `SchemaProvider`.
 */
export function makeSchemaProvider(schema: Schema | null = null): SchemaProvider {
  return {
    async get(): Promise<Schema> {
      if (schema === null) throw new SchemaNotFoundError('(test)')
      return schema
    },
  } as unknown as SchemaProvider
}

/**
 * Creates a mock `Schema` entity.
 */
export function makeSchema(
  artifactsOrOpts:
    | ArtifactType[]
    | {
        name?: string
        version?: number
        compat?: import('../../../src/domain/value-objects/schema.js').SchemaCompatIdentity
        artifacts?: ArtifactType[]
        workflow?: WorkflowStep[]
        metadataExtraction?: MetadataExtraction
        crossArtifactValidations?: import('../../../src/domain/value-objects/cross-artifact-validation.js').CrossArtifactValidationRule[]
      } = [],
  workflow: WorkflowStep[] = [],
  overrides: {
    name?: string
    version?: number
    compat?: import('../../../src/domain/value-objects/schema.js').SchemaCompatIdentity
    metadataExtraction?: MetadataExtraction
    crossArtifactValidations?: import('../../../src/domain/value-objects/cross-artifact-validation.js').CrossArtifactValidationRule[]
  } = {},
): Schema {
  if (Array.isArray(artifactsOrOpts)) {
    return new Schema(
      'schema',
      overrides.name ?? 'test-schema',
      overrides.version ?? 1,
      artifactsOrOpts,
      workflow,
      overrides.metadataExtraction,
      overrides.crossArtifactValidations ?? [],
      undefined,
      overrides.compat,
    )
  }
  return new Schema(
    'schema',
    artifactsOrOpts.name ?? 'test-schema',
    artifactsOrOpts.version ?? 1,
    artifactsOrOpts.artifacts ?? [],
    artifactsOrOpts.workflow ?? [],
    artifactsOrOpts.metadataExtraction,
    artifactsOrOpts.crossArtifactValidations ?? [],
    undefined,
    artifactsOrOpts.compat,
  )
}

/**
 * Creates a mock `ActorResolver`.
 */
export function makeActorResolver(actor: ActorIdentity = testActor): ActorResolver {
  return {
    async identity(): Promise<ActorIdentity> {
      return actor
    },
  }
}

/**
 * Creates a mock `ArtifactParser`.
 */
export function makeParser(overrides: Partial<ArtifactParser> = {}): ArtifactParser {
  const trivialNode: ArtifactNode = { type: 'root' }
  const trivialAST: ArtifactAST = { root: trivialNode }
  return {
    fileExtensions: ['.md'],
    parse: () => trivialAST,
    apply: (ast) => ({ ast, warnings: [] }),
    serialize: () => 'serialized',
    renderSubtree: () => 'rendered',
    nodeTypes: () => [],
    outline: () => [],
    selectorHints: () => ({}),
    deltaInstructions: () => '',
    parseDelta: () => [],
    ...overrides,
  }
}

/**
 * Creates an `ArtifactParserRegistry` with stub parsers.
 */
export function makeParsers(
  markdown: ArtifactParser = makeParser(),
  yaml: ArtifactParser = makeParser(),
): ArtifactParserRegistry {
  const map = new Map<string, ArtifactParser>([
    ['markdown', markdown],
    ['yaml', yaml],
  ])
  return map
}

/**
 * Creates a mock `ArtifactParserRegistry` that returns no-op parsers for everything.
 */
export function makeNoopParsers(): ArtifactParserRegistry {
  const parser = makeParser()
  return {
    get: () => parser,
  } as unknown as ArtifactParserRegistry
}

/**
 * Creates an `ArtifactType` with sensible defaults for testing.
 */
export function makeArtifactType(id: string, extra: Partial<ArtifactTypeProps> = {}): ArtifactType {
  const defaultOutput = id === 'specs' ? 'spec.md' : id === 'verify' ? 'verify.md' : `${id}.md`
  return new ArtifactType({
    id,
    scope: 'change',
    output: defaultOutput,
    requires: [],
    validations: [],
    deltaValidations: [],
    preHashCleanup: [],
    ...extra,
  })
}

/**
 * Creates a mock `WorkflowStep`.
 */
export function makeWorkflowStep(step: string, extra: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    step,
    requires: [],
    requiresTaskCompletion: [],
    hooks: { pre: [], post: [] },
    ...extra,
  }
}

/**
 * Creates a mock `ContentHasher`.
 */
export function makeContentHasher(): ContentHasher {
  return new NodeContentHasher()
}

/**
 * Creates a mock `HookRunner`.
 */
export function makeHookRunner(exitCode = 0): HookRunner {
  return {
    run: async (_command, _variables, _onProgress) => new HookResult(exitCode, '', ''),
  }
}

/**
 * Stub `RunStepHooks` for testing.
 */
export function makeRunStepHooks(
  overrides?: Partial<{
    execute: (
      input: import('../../../src/application/use-cases/run-step-hooks.js').RunStepHooksInput,
      onProgress?: import('../../../src/application/use-cases/run-step-hooks.js').OnHookProgress,
    ) => Promise<RunStepHooksResult>
  }>,
): RunStepHooks {
  return {
    execute:
      overrides?.execute ??
      (async (): Promise<RunStepHooksResult> => ({
        success: true,
        hooks: [],
        failedHooks: [],
      })),
  } as unknown as RunStepHooks
}

/**
 * Creates a mock `ListWorkspaces` use case.
 */
export function makeListWorkspaces(
  repos: Map<string, SpecRepository> = new Map(),
  ownership: Map<string, 'owned' | 'shared' | 'readOnly'> = new Map(),
  codeRoots: Map<string, string> = new Map(),
): ListWorkspaces {
  const config = {
    projectRoot: '/test',
    workspaces: Array.from(repos.keys()).map((name) => ({
      name,
      specsPath: `/test/specs/${name}`,
      codeRoot: codeRoots.get(name) ?? `/test/code/${name}`,
      isExternal: false,
      ownership: ownership.get(name) ?? 'owned',
    })),
  } as any

  return new ListWorkspaces(config as unknown as SpecdConfig, repos)
}

/**
 * Creates a ReadonlyMap of workspaces from a map of spec repositories.
 */
export async function makeWorkspaceMap(
  repos: Map<string, SpecRepository>,
): Promise<ReadonlyMap<string, ProjectWorkspace>> {
  const listWorkspaces = makeListWorkspaces(repos)
  const workspaces = await listWorkspaces.execute()
  return new Map(workspaces.map((ws) => [ws.name, ws]))
}

/**
 * Creates a mock `FileReader` backed by an in-memory map.
 */
export function makeFileReader(files: Record<string, string> = {}): FileReader {
  return {
    async read(absolutePath: string): Promise<string | null> {
      return files[absolutePath] ?? null
    },
  }
}

export function makeStubChangeRepo(change: Change): ChangeRepository {
  return makeChangeRepository([change])
}

export function makeStubSchemaProvider(schema: Schema | null): SchemaProvider {
  return makeSchemaProvider(schema)
}

export function makeStubFileReader(files: Record<string, string> = {}): FileReader {
  return makeFileReader(files)
}

export function makeStubPreviewSpec(): PreviewSpec {
  return {
    execute: async () => ({
      specId: '',
      changeName: '',
      files: [],
      warnings: [],
    }),
  } as unknown as PreviewSpec
}

/**
 * Creates a mock `ArchivedChange` entity.
 */
export function makeArchivedChange(
  name: string,
  overrides: Partial<ArchivedChange> = {},
): ArchivedChange {
  return {
    name,
    state: 'archivable',
    archivedName: name,
    archivedAt: new Date(),
    archivedBy: testActor,
    history: [],
    specIds: [],
    schemaName: 'test-schema',
    schemaVersion: 1,
    artifacts: new Map(),
    workspaces: ['default'],
    ...overrides,
  } as unknown as ArchivedChange
}

/**
 * Creates a mock `Change` in `archivable` state.
 */
export function makeArchivableChange(
  name: string,
  overrides: Partial<import('../../../src/domain/entities/change.js').ChangeProps> = {},
): Change {
  const c = makeChange(name, overrides)
  c.transition('designing', testActor)
  c.transition('ready', testActor)
  c.transition('implementing', testActor)
  c.transition('verifying', testActor)
  c.transition('done', testActor)
  c.transition('archivable', testActor)
  return c
}

/**
 * Creates a stub {@link MaterializeSpecMetadata} that returns empty generated metadata.
 *
 * @returns Typed materialize-metadata test double
 */
export function makeMaterializeMetadata(): MaterializeSpecMetadata {
  return {
    execute: async () => ({
      metadata: {},
      metadataFingerprint: 'test',
      source: 'generated' as const,
      regenerated: true,
      warnings: [],
    }),
  } as unknown as MaterializeSpecMetadata
}

/**
 * Creates a mock `GetActiveSchema` use case.
 *
 * @param schema - Schema returned from project-mode resolution
 * @returns A stub `GetActiveSchema` instance
 */
export function makeGetActiveSchema(
  schema: Schema = makeSchema({ name: 'specd-std' }),
): GetActiveSchema {
  return {
    execute: async () => ({ raw: false as const, schema }),
  } as unknown as GetActiveSchema
}

/**
 * Creates a mock `DetectOverlap` use case.
 *
 * @param report - Overlap report returned from execute
 * @returns A stub `DetectOverlap` instance
 */
export function makeDetectOverlap(report: OverlapReport = new OverlapReport([])): DetectOverlap {
  return {
    execute: async () => report,
  } as unknown as DetectOverlap
}

/**
 * Creates a `CreateChange` use case with default test doubles for orchestration deps.
 *
 * @param changes - Change repository
 * @param listWorkspaces - Workspace orchestrator
 * @param opts - Optional overrides for injected dependencies
 * @returns Wired `CreateChange` instance
 */
export function makeCreateChange(
  changes: ChangeRepository,
  listWorkspaces: ListWorkspaces,
  opts: {
    actor?: ActorResolver
    getActiveSchema?: GetActiveSchema
    detectOverlap?: DetectOverlap
  } = {},
): CreateChange {
  return new CreateChange(
    changes,
    listWorkspaces,
    opts.actor ?? makeActorResolver(),
    opts.getActiveSchema ?? makeGetActiveSchema(),
    opts.detectOverlap ?? makeDetectOverlap(),
  )
}

/**
 * Checks whether a value is a string-to-string record.
 *
 * @param value - Candidate record
 * @returns `true` when every enumerable value is a string
 */
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
}

/**
 * Compares two string arrays ignoring order.
 *
 * @param left - First list
 * @param right - Second list
 * @returns `true` when both lists contain the same values
 */
function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((entry, index) => entry === sortedRight[index])
}

/** GetSpecMetadata test double that always fails materialization. */
export const missingGetSpecMetadata = {
  execute: async () => {
    throw new Error('metadata missing')
  },
} as unknown as GetSpecMetadata

/**
 * Creates a snapshot-backed {@link GetSpecMetadata} for unit tests.
 *
 * @param repos - Spec repositories keyed by workspace name
 * @param hasher - Optional content hasher
 * @returns GetSpecMetadata test double
 */
export function makeGetSpecMetadata(
  repos: Map<string, SpecRepository>,
  hasher: ContentHasher = makeContentHasher(),
): GetSpecMetadata {
  return makeSnapshotGetSpecMetadata(repos, hasher)
}
