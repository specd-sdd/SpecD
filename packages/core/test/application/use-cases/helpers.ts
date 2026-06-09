import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { Change, type ActorIdentity } from '../../../src/domain/entities/change.js'
import { type Spec } from '../../../src/domain/entities/spec.js'
import { ChangeArtifact } from '../../../src/domain/entities/change-artifact.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { ArtifactFile } from '../../../src/domain/value-objects/artifact-file.js'
import {
  ArtifactType,
  type ArtifactTypeProps,
} from '../../../src/domain/value-objects/artifact-type.js'
import {
  ArtifactDag,
  artifactDagFromChangeArtifacts,
} from '../../../src/domain/value-objects/artifact-dag.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import { type MetadataExtraction } from '../../../src/domain/value-objects/metadata-extraction.js'
import { type CrossArtifactValidationRule } from '../../../src/domain/value-objects/cross-artifact-validation.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
import { ChangeRepository } from '../../../src/application/ports/change-repository.js'
import {
  type SpecPublication,
  SpecRepository,
  type ResolveFromPathResult,
  type SpecSearchResult,
} from '../../../src/application/ports/spec-repository.js'
import { type SpecMetadata } from '../../../src/domain/services/parse-metadata.js'
import { type SpecLockData } from '../../../src/domain/services/parse-spec-lock.js'
import {
  ArchiveRepository,
  type ArchiveListOptions,
  type ArchiveListResult,
} from '../../../src/application/ports/archive-repository.js'
import { type SchemaRegistry } from '../../../src/application/ports/schema-registry.js'
import { type SchemaProvider } from '../../../src/application/ports/schema-provider.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactAST,
  type ArtifactNode,
  type DeltaApplicationResult,
  type DeltaEntry,
} from '../../../src/application/ports/artifact-parser.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { ContentHasher } from '../../../src/application/ports/content-hasher.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { type HookRunner } from '../../../src/application/ports/hook-runner.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import {
  RunStepHooks,
  type RunStepHooksResult,
  type RunStepHooksInput,
  type OnHookProgress,
} from '../../../src/application/use-cases/run-step-hooks.js'
import { type ActorResolver } from '../../../src/application/ports/actor-resolver.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import {
  ListWorkspaces,
  type ProjectWorkspace,
} from '../../../src/application/use-cases/list-workspaces.js'
import {
  type ArchivedChange,
  toArchivedChangeView,
  toDiscardedChangeView,
  toDraftedChangeView,
  type DiscardedChangeView,
  type DraftedChangeView,
  type ReadOnlyChangeOrigin,
} from '../../../src/domain/read-only-change-view.js'

/** Default identity for test actors. */
export const testActor: ActorIdentity = { name: 'Test User', email: 'test@example.com' }

/**
 * In-memory `ChangeRepository` subclass for unit tests.
 *
 * `get`, `list`, `save`, and `delete` are wired to the map. `artifact` and
 * `saveArtifact` throw `'not implemented'` — override in specific tests that
 * need them.
 */
class StubChangeRepository extends ChangeRepository {
  readonly store: Map<string, Change>

  constructor(changes: Change[] = []) {
    super({ workspace: 'default', ownership: 'owned', isExternal: false, configPath: '/test' })
    this.store = new Map(changes.map((c) => [c.name, cloneChange(c)]))
  }

  override async get(name: string): Promise<Change | null> {
    const change = this.store.get(name)
    if (change === undefined) return null
    const cloned = cloneChange(change)
    if (cloned.isDrafted) return null
    if (isDiscardedStub(cloned)) return null
    return cloned
  }

  override async getDraft(name: string): Promise<DraftedChangeView | null> {
    const change = this.store.get(name)
    if (change === undefined) return null
    const cloned = cloneChange(change)
    if (!cloned.isDrafted || isDiscardedStub(cloned)) return null
    return toDraftedChangeView(cloned)
  }

  override async getDiscarded(name: string): Promise<DiscardedChangeView | null> {
    const change = this.store.get(name)
    if (change === undefined) return null
    const cloned = cloneChange(change)
    if (!isDiscardedStub(cloned)) return null
    return toDiscardedChangeView(cloned)
  }

  override async artifactReadOnly(
    readOnlyOrigin: ReadOnlyChangeOrigin,
    name: string,
    filename: string,
  ): Promise<SpecArtifact | null> {
    const change = this.store.get(name)
    if (change === undefined) return null
    const cloned = cloneChange(change)
    if (readOnlyOrigin === 'draft') {
      if (!cloned.isDrafted || isDiscardedStub(cloned)) return null
    } else if (readOnlyOrigin === 'discarded') {
      if (!isDiscardedStub(cloned)) return null
    } else {
      return null
    }
    return this.artifact(cloned, filename)
  }

  override async list(): Promise<Change[]> {
    return [...this.store.values()]
      .map((change) => cloneChange(change))
      .filter((change) => !change.isDrafted && !isDiscardedStub(change))
  }

  override async listDrafts(): Promise<DraftedChangeView[]> {
    return [...this.store.values()]
      .filter((change) => change.isDrafted && !isDiscardedStub(change))
      .map((change) => toDraftedChangeView(cloneChange(change)))
  }

  override async listDiscarded(): Promise<DiscardedChangeView[]> {
    return [...this.store.values()]
      .filter((change) => isDiscardedStub(change))
      .map((change) => toDiscardedChangeView(cloneChange(change)))
  }

  override async mutateDraft<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T> {
    const change = await this.getDraft(name)
    if (change === null) {
      throw new ChangeNotFoundError(name)
    }
    const stored = this.store.get(name)
    if (stored === undefined) {
      throw new ChangeNotFoundError(name)
    }
    const working = cloneChange(stored)
    const result = await fn(working)
    await this.save(working)
    return result
  }

  override async mutate<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T> {
    const change = await this.get(name)
    if (change === null) {
      throw new ChangeNotFoundError(name)
    }

    const result = await fn(change)
    await this.save(change)
    return result
  }

  override async save(change: Change): Promise<void> {
    change.touchUpdatedAt()
    this.store.set(change.name, cloneChange(change))
  }

  override async delete(change: Change): Promise<void> {
    this.store.delete(change.name)
  }

  override async artifact(_change: Change, _filename: string): Promise<SpecArtifact | null> {
    return null
  }

  override async saveArtifact(
    _change: Change,
    _artifact: SpecArtifact,
    _options?: { force?: boolean },
  ): Promise<void> {
    // no-op in tests unless overridden
  }

  override changePath(change: Change): string {
    return `/test/changes/${change.name}`
  }

  override draftChangePath(view: DraftedChangeView): string {
    return `/test/drafts/${view.name}`
  }

  override async artifactExists(_change: Change, _filename: string): Promise<boolean> {
    return false
  }

  override async deltaExists(
    _change: Change,
    _specId: string,
    _filename: string,
  ): Promise<boolean> {
    return false
  }

  override async scaffold(
    _change: Change,
    _specExists: (specId: string) => Promise<boolean>,
  ): Promise<void> {
    // no-op in tests
  }

  override async unscaffold(_change: Change, _specIds: readonly string[]): Promise<void> {
    // no-op in tests
  }

  override async reconcileArtifactDrift(
    _change: Change,
    _options?: { readonly excludeFileKeys?: readonly string[] },
  ): Promise<boolean> {
    return false
  }
}

/**
 * Creates a fully-typed `ChangeRepository` backed by an in-memory map.
 */
export function makeChangeRepository(
  initial: Change[] = [],
): ChangeRepository & { store: Map<string, Change> } {
  return new StubChangeRepository(initial)
}

/**
 * Creates a `ListWorkspaces` use case for test repositories.
 *
 * @param repos - Workspace repositories keyed by workspace name
 * @returns `ListWorkspaces` wired to a synthetic owned-workspace config
 */
export function makeListWorkspaces(
  repos: ReadonlyMap<string, SpecRepository>,
  ownerships?: ReadonlyMap<string, 'owned' | 'shared' | 'readOnly'>,
  codeRoots?: ReadonlyMap<string, string>,
): ListWorkspaces {
  const normalizedRepos = new Map(repos)
  if (!normalizedRepos.has('default')) {
    normalizedRepos.set('default', makeSpecRepository())
  }
  const workspaceNames = [...normalizedRepos.keys()]
  const config = {
    projectRoot: '/test',
    configPath: '/test',
    schemaRef: '@specd/schema-std',
    workspaces: workspaceNames.map((name) => ({
      name,
      specsPath: `/test/specs/${name}`,
      specsAdapter: { adapter: 'fs', config: {} },
      schemasPath: name === 'default' ? '/test/schemas' : null,
      schemasAdapter: name === 'default' ? { adapter: 'fs', config: {} } : null,
      codeRoot: codeRoots?.get(name) ?? `/test/code/${name}`,
      ownership: ownerships?.get(name) ?? ('owned' as const),
      isExternal: false,
    })),
    storage: {
      changesPath: '/test/changes',
      changesAdapter: { adapter: 'fs', config: {} },
      draftsPath: '/test/drafts',
      draftsAdapter: { adapter: 'fs', config: {} },
      discardedPath: '/test/discarded',
      discardedAdapter: { adapter: 'fs', config: {} },
      archivePath: '/test/archive',
      archiveAdapter: { adapter: 'fs', config: {} },
    },
    approvals: { spec: false, signoff: false },
  } as unknown as SpecdConfig

  return new ListWorkspaces(config, normalizedRepos)
}

/**
 * Executes `ListWorkspaces` and returns a map keyed by workspace name.
 *
 * @param repos - Workspace repositories keyed by workspace name
 * @returns Orchestrated workspace map for context helpers
 */
export async function makeWorkspaceMap(
  repos: ReadonlyMap<string, SpecRepository>,
): Promise<ReadonlyMap<string, ProjectWorkspace>> {
  const workspaces = await makeListWorkspaces(repos).execute()
  return new Map(workspaces.map((workspace) => [workspace.name, workspace]))
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
 * Creates a deep copy of a `Change` suitable for in-memory repository tests.
 *
 * @param change - The change to clone
 * @returns A deep-cloned `Change`
 */
function cloneChange(change: Change): Change {
  const artifacts = new Map<string, ChangeArtifact>()
  for (const [type, artifact] of change.artifacts) {
    const files = new Map<string, ArtifactFile>()
    for (const [key, file] of artifact.files) {
      files.set(
        key,
        new ArtifactFile({
          key: file.key,
          filename: file.filename,
          status: file.status,
          ...(file.validatedHash !== undefined ? { validatedHash: file.validatedHash } : {}),
          ...(file.hasDrift ? { hasDrift: true } : {}),
        }),
      )
    }

    artifacts.set(
      type,
      new ChangeArtifact({
        type: artifact.type,
        optional: artifact.optional,
        requires: artifact.requires,
        files,
      }),
    )
  }

  const specDependsOn = new Map<string, readonly string[]>()
  for (const [specId, deps] of change.specDependsOn) {
    specDependsOn.set(specId, [...deps])
  }

  return new Change({
    name: change.name,
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
    ...(change.description !== undefined ? { description: change.description } : {}),
    specIds: change.specIds,
    history: change.history.map((event) => cloneChangeEvent(event)),
    artifacts,
    trackedImplementationFiles: change.trackedImplementationFiles.map((entry) => ({
      file: entry.file,
      state: entry.state,
    })),
    implementationLinks: change.implementationLinks.map((link) => ({
      specId: link.specId,
      file: link.file,
      fileLinkExplicit: link.fileLinkExplicit,
      ...(link.symbols !== undefined ? { symbols: [...link.symbols] } : {}),
    })),
    specDependsOn,
    invalidationPolicy: change.invalidationPolicy,
  })
}

/**
 * Clones a change history event, preserving its discriminated-union shape.
 *
 * @param event - The history event to clone
 * @returns A cloned event with copied dates, actors, and nested arrays
 */
function cloneChangeEvent(event: Change['history'][number]): Change['history'][number] {
  switch (event.type) {
    case 'created':
      return {
        type: 'created',
        at: new Date(event.at),
        by: { ...event.by },
        specIds: [...event.specIds],
        schemaName: event.schemaName,
        schemaVersion: event.schemaVersion,
      }
    case 'transitioned':
      return {
        type: 'transitioned',
        at: new Date(event.at),
        by: { ...event.by },
        from: event.from,
        to: event.to,
      }
    case 'spec-approved':
      return {
        type: 'spec-approved',
        at: new Date(event.at),
        by: { ...event.by },
        reason: event.reason,
        artifactHashes: { ...event.artifactHashes },
      }
    case 'signed-off':
      return {
        type: 'signed-off',
        at: new Date(event.at),
        by: { ...event.by },
        reason: event.reason,
        artifactHashes: { ...event.artifactHashes },
      }
    case 'invalidated':
      return {
        type: 'invalidated',
        at: new Date(event.at),
        by: { ...event.by },
        cause: event.cause,
        message: event.message,
        affectedArtifacts: event.affectedArtifacts.map((artifact) => ({
          type: artifact.type,
          files: [...artifact.files],
        })),
      }
    case 'drafted':
      return event.reason !== undefined
        ? {
            type: 'drafted',
            at: new Date(event.at),
            by: { ...event.by },
            reason: event.reason,
          }
        : {
            type: 'drafted',
            at: new Date(event.at),
            by: { ...event.by },
          }
    case 'restored':
      return {
        type: 'restored',
        at: new Date(event.at),
        by: { ...event.by },
      }
    case 'discarded':
      return event.supersededBy !== undefined
        ? {
            type: 'discarded',
            at: new Date(event.at),
            by: { ...event.by },
            reason: event.reason,
            supersededBy: [...event.supersededBy],
          }
        : {
            type: 'discarded',
            at: new Date(event.at),
            by: { ...event.by },
            reason: event.reason,
          }
    case 'artifact-skipped':
      return event.reason !== undefined
        ? {
            type: 'artifact-skipped',
            at: new Date(event.at),
            by: { ...event.by },
            artifactId: event.artifactId,
            reason: event.reason,
          }
        : {
            type: 'artifact-skipped',
            at: new Date(event.at),
            by: { ...event.by },
            artifactId: event.artifactId,
          }
    case 'artifacts-synced':
      return {
        type: 'artifacts-synced',
        at: new Date(event.at),
        by: { ...event.by },
        typesAdded: [...event.typesAdded],
        typesRemoved: [...event.typesRemoved],
        filesAdded: event.filesAdded.map((file) => ({ ...file })),
        filesRemoved: event.filesRemoved.map((file) => ({ ...file })),
      }
    case 'description-updated':
      return {
        type: 'description-updated',
        at: new Date(event.at),
        by: { ...event.by },
        description: event.description,
      }
    case 'archive-failed':
      return {
        type: 'archive-failed',
        at: new Date(event.at),
        by: { ...event.by },
        step: event.step,
        message: event.message,
        commitStarted: event.commitStarted,
      }
  }
}

/**
 * Creates a fully-typed mock `ActorResolver`.
 *
 * Returns sensible defaults. Override individual methods as needed.
 */
export function makeActorResolver(overrides: Partial<ActorResolver> = {}): ActorResolver {
  return {
    async identity(): Promise<ActorIdentity> {
      return testActor
    },
    ...overrides,
  }
}

/**
 * Builds a minimal `Change` in `drafting` state for use in tests.
 *
 * Includes a `created` event with `schemaName: 'test-schema'` by default,
 * matching the default name used by `makeSchema()`.
 */
export function makeChange(
  name: string,
  opts: { specIds?: string[]; schemaName?: string } = {},
): Change {
  const specIds = opts.specIds ?? ['auth/login']
  const createdAt = new Date('2024-01-01T00:00:00Z')
  return new Change({
    name,
    createdAt,
    specIds,
    history: [
      {
        type: 'created',
        at: createdAt,
        by: { name: 'Test User', email: 'test@example.com' },
        specIds,
        schemaName: opts.schemaName ?? 'test-schema',
        schemaVersion: 1,
      },
    ],
  })
}

/**
 * In-memory `SpecRepository` subclass for unit tests.
 */
class StubSpecRepository extends SpecRepository {
  private readonly _specs: Spec[]
  private readonly _artifacts: Record<string, string | null>
  private readonly _saveFn:
    | ((spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>)
    | undefined
  private readonly _publishFn:
    | ((spec: Spec, publication: SpecPublication) => Promise<void>)
    | undefined
  private readonly _deleteFn: ((spec: Spec) => Promise<void>) | undefined
  private readonly _resolveFromPathFn:
    | ((inputPath: string, from?: SpecPath) => Promise<ResolveFromPathResult | null>)
    | undefined

  async count(): Promise<number> {
    return this._specs.length
  }

  readonly saved = new Map<string, string>()

  constructor(opts: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    save?: (spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>
    publish?: (spec: Spec, publication: SpecPublication) => Promise<void>
    delete?: (spec: Spec) => Promise<void>
    resolveFromPath?: (inputPath: string, from?: SpecPath) => Promise<ResolveFromPathResult | null>
    ownership?: 'owned' | 'shared' | 'readOnly'
    workspace?: string
  }) {
    super({
      workspace: opts.workspace ?? 'default',
      ownership: opts.ownership ?? 'owned',
      isExternal: false,
      configPath: '/test',
    })
    this._specs = opts.specs ?? []
    this._artifacts = opts.artifacts ?? {}
    this._saveFn = opts.save
    this._publishFn = opts.publish
    this._deleteFn = opts.delete
    this._resolveFromPathFn = opts.resolveFromPath
  }

  override async get(name: SpecPath): Promise<Spec | null> {
    return this._specs.find((s) => s.name.toString() === name.toString()) ?? null
  }

  override async list(prefix?: SpecPath): Promise<Spec[]> {
    if (prefix === undefined) return this._specs
    const prefixStr = prefix.toString()
    return this._specs.filter((s) => {
      const p = s.name.toString()
      return p === prefixStr || p.startsWith(`${prefixStr}/`)
    })
  }

  override async artifact(_spec: Spec, filename: string): Promise<SpecArtifact | null> {
    const key = `${_spec.name.toString()}/${filename}`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    return new SpecArtifact(filename, content)
  }

  override async save(
    spec: Spec,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void> {
    this.saved.set(artifact.filename, artifact.content)
    if (this._saveFn) return this._saveFn(spec, artifact, options)
  }

  override async publish(spec: Spec, publication: SpecPublication): Promise<void> {
    for (const artifact of publication.artifacts) {
      this.saved.set(artifact.filename, artifact.content)
    }
    const existingSpecLock = this.readSpecLock(spec)
    const shouldPersistSpecLock =
      publication.persistedSchema !== undefined ||
      publication.persistedDependsOn !== undefined ||
      publication.persistedImplementation !== undefined ||
      existingSpecLock !== null
    if (shouldPersistSpecLock) {
      const persistedSchema = publication.persistedSchema ??
        existingSpecLock?.schema ?? {
          name: 'test-schema',
          version: 1,
        }
      const persistedDependsOn = publication.persistedDependsOn ?? existingSpecLock?.dependsOn ?? []
      const persistedImplementation =
        publication.persistedImplementation ?? existingSpecLock?.implementation ?? []
      this._persistSpecLock(spec, {
        schema: persistedSchema,
        dependsOn: [...persistedDependsOn],
        implementation: [...persistedImplementation],
      })
    }
    if (this._publishFn !== undefined) {
      return this._publishFn(spec, publication)
    }
  }

  override async delete(spec: Spec): Promise<void> {
    if (this._deleteFn) return this._deleteFn(spec)
  }

  override async metadata(spec: Spec): Promise<SpecMetadata | null> {
    const jsonKey = `${spec.name.toString()}/metadata.json`
    const legacyKey = `${spec.name.toString()}/.specd-metadata.yaml`
    const content = this._artifacts[jsonKey] ?? this._artifacts[legacyKey]
    if (content === undefined || content === null) return null
    const parsed = JSON.parse(content)
    if (parsed === null || parsed === undefined || typeof parsed !== 'object') return null
    return parsed as SpecMetadata
  }

  override async saveMetadata(
    spec: Spec,
    content: string,
    _options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    this.saved.set('metadata.json', content)
    this.saved.set('.specd-metadata.yaml', content)
  }

  private readSpecLock(spec: Spec): SpecLockData | null {
    const key = `${spec.name.toString()}/spec-lock.json`
    const content = this.saved.get(key) ?? this.saved.get('spec-lock.json') ?? this._artifacts[key]
    if (content === undefined || content === null) return null
    return JSON.parse(content) as SpecLockData
  }

  override async readPersistedSchema(
    spec: Spec,
  ): Promise<{ name: string; version: number } | null> {
    return this.readSpecLock(spec)?.schema ?? null
  }

  override async readPersistedDependsOn(spec: Spec): Promise<readonly string[] | null> {
    return this.readSpecLock(spec)?.dependsOn ?? null
  }

  override async readPersistedImplementation(
    spec: Spec,
  ): Promise<readonly { readonly file: string; readonly symbols?: readonly string[] }[] | null> {
    const impl = this.readSpecLock(spec)?.implementation
    return (
      (impl as unknown as readonly {
        readonly file: string
        readonly symbols?: readonly string[]
      }[]) ?? null
    )
  }

  override async specHash(spec: Spec): Promise<string | null> {
    const persisted =
      this.saved.get(`${spec.name.toString()}/spec-lock.json`) ??
      this.saved.get('spec-lock.json') ??
      this._artifacts[`${spec.name.toString()}/spec-lock.json`]
    if (persisted === undefined || persisted === null) {
      return null
    }
    return new NodeContentHasher().hash(persisted)
  }

  override async updatePersistedSchema(
    spec: Spec,
    schema: { name: string; version: number },
    _options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const current = this.readSpecLock(spec) ?? {
      schema,
      dependsOn: [],
      implementation: [],
    }
    this._persistSpecLock(spec, { ...current, schema })
  }

  override async updatePersistedDependsOn(
    spec: Spec,
    dependsOn: readonly string[],
    _options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const current = this.readSpecLock(spec) ?? {
      schema: { name: 'test-schema', version: 1 },
      dependsOn: [],
      implementation: [],
    }
    this._persistSpecLock(spec, { ...current, dependsOn: [...dependsOn] })
  }

  override async updatePersistedImplementation(
    spec: Spec,
    implementation: readonly { readonly file: string; readonly symbols?: readonly string[] }[],
    _options?: { force?: boolean; originalHash?: string },
  ): Promise<void> {
    const current = this.readSpecLock(spec) ?? {
      schema: { name: 'test-schema', version: 1 },
      dependsOn: [],
      implementation: [],
    }
    this._persistSpecLock(spec, {
      ...current,
      implementation: implementation.map((entry) => ({
        file: entry.file,
        ...(entry.symbols !== undefined ? { symbols: [...entry.symbols] } : {}),
      })),
    })
  }

  private _persistSpecLock(spec: Spec, content: SpecLockData): void {
    const serialized = JSON.stringify(content)
    this.saved.set(`${spec.name.toString()}/spec-lock.json`, serialized)
    this.saved.set('spec-lock.json', serialized)
  }

  override async resolveFromPath(
    inputPath: string,
    from?: SpecPath,
  ): Promise<ResolveFromPathResult | null> {
    if (this._resolveFromPathFn !== undefined) {
      return await this._resolveFromPathFn(inputPath, from)
    }
    return null
  }

  override async search(): Promise<SpecSearchResult[]> {
    return []
  }
}

/**
 * Creates a `SpecRepository` backed by in-memory arrays.
 */
export function makeSpecRepository(
  overridesOrOwnership?:
    | {
        specs?: Spec[]
        artifacts?: Record<string, string | null>
        save?: (spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>
        publish?: (spec: Spec, publication: SpecPublication) => Promise<void>
        delete?: (spec: Spec) => Promise<void>
        resolveFromPath?: (
          inputPath: string,
          from?: SpecPath,
        ) => Promise<ResolveFromPathResult | null>
        ownership?: 'owned' | 'shared' | 'readOnly'
        workspace?: string
      }
    | 'owned'
    | 'shared'
    | 'readOnly',
): SpecRepository & { saved: Map<string, string> } {
  const overrides =
    typeof overridesOrOwnership === 'string'
      ? { ownership: overridesOrOwnership }
      : (overridesOrOwnership ?? {})
  return new StubSpecRepository(overrides)
}

/**
 * Creates a mock `SchemaRegistry` that returns a fixed schema on `resolve()`.
 */
export function makeSchemaRegistry(schema: Schema | null = null): SchemaRegistry {
  return {
    async resolve(): Promise<Schema | null> {
      return schema
    },
    async resolveRaw() {
      return null
    },
    async list() {
      return []
    },
  }
}

/**
 * Creates a mock `SchemaProvider` that returns a fixed schema on `get()`.
 *
 * When `schema` is `null`, the provider throws `SchemaNotFoundError` to
 * match the real contract where `get()` never returns `null`.
 */
export function makeSchemaProvider(schema: Schema | null = null): SchemaProvider {
  return {
    async get(): Promise<Schema> {
      if (schema === null) throw new SchemaNotFoundError('(test)')
      return schema
    },
  }
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

/**
 * Creates a mock `HookRunner` with a fixed exit code and stderr.
 */
export function makeHookRunner(exitCode = 0, stderr = ''): HookRunner {
  return {
    async run(): Promise<HookResult> {
      return new HookResult(exitCode, '', stderr)
    },
  }
}

/**
 * Creates an `ArtifactType` with sensible defaults for testing.
 *
 * All required fields are populated with empty arrays / safe fallbacks.
 * Pass any `ArtifactTypeProps` partial to override.
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
 * Builds an {@link ArtifactDag} from a change's persisted artifact graph.
 *
 * @param change - Change with artifact entries
 * @returns DAG for `Change.invalidate` / `updateSpecIds` in tests
 */
export function artifactDagFromChange(change: Change): ArtifactDag {
  return artifactDagFromChangeArtifacts(
    [...change.artifacts.values()].map((artifact) => ({
      type: artifact.type,
      requires: artifact.requires,
    })),
  )
}

export function makeSchema(
  optsOrArtifacts:
    | {
        artifacts?: ArtifactType[]
        workflow?: WorkflowStep[]
        name?: string
        metadataExtraction?: MetadataExtraction
        crossArtifactValidations?: readonly CrossArtifactValidationRule[]
      }
    | ArtifactType[] = {},
  workflow: WorkflowStep[] = [],
): Schema {
  if (Array.isArray(optsOrArtifacts)) {
    return new Schema('schema', 'test-schema', 1, optsOrArtifacts, workflow)
  }
  return new Schema(
    'schema',
    optsOrArtifacts.name ?? 'test-schema',
    1,
    optsOrArtifacts.artifacts ?? [],
    optsOrArtifacts.workflow ?? [],
    optsOrArtifacts.metadataExtraction,
    optsOrArtifacts.crossArtifactValidations ?? [],
  )
}

/**
 * Creates a stub `ArtifactParser` with no-op defaults.
 *
 * Override individual operations as needed.
 */
export function makeParser(
  opts: {
    parse?: (content: string) => ArtifactAST
    apply?: (ast: ArtifactAST, delta: readonly DeltaEntry[]) => DeltaApplicationResult
    serialize?: (ast: ArtifactAST) => string
    renderSubtree?: (node: ArtifactNode) => string
    parseDelta?: (content: string) => readonly DeltaEntry[]
  } = {},
): ArtifactParser {
  const trivialNode: ArtifactNode = { type: 'root' }
  const trivialAST: ArtifactAST = { root: trivialNode }
  return {
    fileExtensions: ['.md'],
    parse: opts.parse ?? (() => trivialAST),
    apply: opts.apply ?? ((ast) => ({ ast, warnings: [] })),
    serialize: opts.serialize ?? (() => 'serialized'),
    renderSubtree: opts.renderSubtree ?? (() => 'rendered'),
    nodeTypes: () => [],
    outline: () => [],
    selectorHints: () => ({}),
    deltaInstructions: () => '',
    parseDelta: opts.parseDelta ?? (() => []),
  }
}

/**
 * Creates a `ContentHasher` for use in tests.
 *
 * Uses the real `NodeContentHasher` since hashing is deterministic and cheap.
 */
export function makeContentHasher(): ContentHasher {
  return new NodeContentHasher()
}

/**
 * Creates an `ArtifactParserRegistry` with stub parsers for markdown and yaml.
 */
export function makeParsers(
  markdown: ArtifactParser = makeParser(),
  yaml: ArtifactParser = makeParser(),
): ArtifactParserRegistry {
  return new Map([
    ['markdown', markdown],
    ['yaml', yaml],
  ])
}

/**
 * In-memory `ArchiveRepository` subclass for unit tests.
 *
 * `get` looks up by name; `archivePath` returns a deterministic test path.
 * `archive`, `list`, and `reindex` throw — override in tests that need them.
 */
class StubArchiveRepository extends ArchiveRepository {
  readonly store: Map<string, ArchivedChange>

  constructor(archived: ArchivedChange[] = []) {
    super({ workspace: 'default', ownership: 'owned', isExternal: false, configPath: '/test' })
    this.store = new Map(archived.map((a) => [a.name, a]))
  }

  override async archive(): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }> {
    throw new Error('not implemented')
  }

  override async list(options?: ArchiveListOptions): Promise<ArchiveListResult> {
    const items = [...this.store.values()]
    return {
      items: items.map((change) => ({
        name: change.name,
        archivedName: change.archivedName,
        archivedAt: change.archivedAt,
        ...(change.description !== undefined ? { description: change.description } : {}),
        ...(change.archivedBy !== undefined ? { archivedBy: change.archivedBy } : {}),
        specIds: [...change.specIds],
        schemaName: change.schemaName,
        schemaVersion: change.schemaVersion,
        workspaces: [...change.workspaces],
        artifacts: [...change.artifacts.keys()],
      })),
      meta: {
        total: items.length,
        count: items.length,
        limit: options?.limit ?? 100,
        ...(options?.page !== undefined ? { page: options.page } : {}),
        ...(options?.startAt !== undefined ? { startAt: options.startAt } : {}),
      },
    }
  }

  override async get(name: string): Promise<ArchivedChange | null> {
    return this.store.get(name) ?? null
  }

  override async artifact(
    _change: ArchivedChange,
    _filename: string,
  ): Promise<SpecArtifact | null> {
    return null
  }

  override async reindex(): Promise<void> {}

  override archivePath(archivedChange: ArchivedChange): string {
    return `/test/archive/${archivedChange.archivedName}`
  }
}

/**
 * Creates a fully-typed `ArchiveRepository` backed by an in-memory map.
 */
export function makeArchiveRepository(
  initial: ArchivedChange[] = [],
): ArchiveRepository & { store: Map<string, ArchivedChange> } {
  return new StubArchiveRepository(initial)
}

/**
 * Builds a minimal `ArchivedChange` for use in tests.
 */
export function makeArchivedChange(
  name: string,
  opts: { specIds?: string[]; schemaName?: string } = {},
): ArchivedChange {
  const change = new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    specIds: opts.specIds ?? ['default:default'],
    history: [
      {
        type: 'created',
        at: new Date('2024-01-01T00:00:00Z'),
        by: testActor,
        specIds: opts.specIds ?? ['default:default'],
        schemaName: opts.schemaName ?? 'test-schema',
        schemaVersion: 1,
      },
    ],
  })
  change.transition('designing', testActor)
  change.transition('ready', testActor)
  change.transition('implementing', testActor)
  change.transition('verifying', testActor)
  change.transition('done', testActor)
  change.transition('archivable', testActor)

  return toArchivedChangeView(change, {
    archivedName: `20240101-000000-${name}`,
    archivedAt: new Date('2024-01-02T00:00:00Z'),
    archivedBy: testActor,
  })
}

/**
 * Stub `RunStepHooks` that returns a configurable result without actually
 * running any hooks.
 *
 * By default returns `{ hooks: [], success: true, failedHook: null }`.
 */
export function makeRunStepHooks(
  overrides?: Partial<{
    execute: (input: RunStepHooksInput, onProgress?: OnHookProgress) => Promise<RunStepHooksResult>
  }>,
): RunStepHooks {
  const defaultExecute = async (): Promise<RunStepHooksResult> => ({
    hooks: [],
    success: true,
    failedHook: null,
  })
  return {
    execute: overrides?.execute ?? defaultExecute,
  } as unknown as RunStepHooks
}
