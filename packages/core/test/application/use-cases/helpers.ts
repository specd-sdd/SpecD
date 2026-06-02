import { SchemaNotFoundError } from '../../../src/application/errors/schema-not-found-error.js'
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
  type SpecPublication,
  SpecRepository,
  type ResolveFromPathResult,
  type SpecSearchResult,
} from '../../../src/application/ports/spec-repository.js'
import { type SpecMetadata } from '../../../src/domain/services/parse-metadata.js'
import {
  ArchiveRepository,
  type ArchivePathEntry,
  type ArchiveListResult,
  type ArchiveListOptions,
} from '../../../src/application/ports/archive-repository.js'
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

  async save(change: Change): Promise<void> {
    this.store.set(change.name, change)
  }

  async saveDraft(change: Change): Promise<void> {
    this.store.set(change.name, change)
  }

  async delete(change: Change): Promise<void> {
    this.store.delete(change.name)
  }

  async list(): Promise<Change[]> {
    return Array.from(this.store.values()).filter((c) => !c.isDrafted && !isDiscardedStub(c))
  }

  async listDrafts(): Promise<DraftedChangeView[]> {
    return Array.from(this.store.values())
      .filter((c) => c.isDrafted)
      .map(toDraftedChangeView)
  }

  async listDiscarded(): Promise<DiscardedChangeView[]> {
    return Array.from(this.store.values())
      .filter((c) => isDiscardedStub(c))
      .map(toDiscardedChangeView)
  }

  async mutate<T>(name: string, fn: (c: Change) => Promise<T> | T): Promise<T> {
    const change = this.store.get(name)
    if (!change) throw new ChangeNotFoundError(name)
    const result = await fn(change)
    await this.save(change)
    return result
  }

  async mutateDraft<T>(name: string, fn: (c: Change) => Promise<T> | T): Promise<T> {
    const change = this.store.get(name)
    if (!change) throw new ChangeNotFoundError(name)
    const result = await fn(change)
    await this.save(change)
    return result
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

  override async list(prefix?: SpecPath): Promise<Spec[]> {
    if (prefix === undefined) return this._specs
    return this._specs.filter((s) => prefix.equals(s.name) || prefix.isAncestorOf(s.name))
  }

  override async count(): Promise<number> {
    return this._specs.length
  }

  override async specHash(): Promise<string | null> {
    return 'sha256:test'
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
    if (publication.persistedDependsOn !== undefined) {
      const lockData = {
        schema: publication.persistedSchema ?? { name: 'test-schema', version: 1 },
        dependsOn: publication.persistedDependsOn,
        implementation: publication.persistedImplementation ?? [],
      }
      const json = JSON.stringify(lockData)
      this.saved.set(`${spec.name.toString()}/spec-lock.json`, json)
      this.saved.set('spec-lock.json', json)
    }
  }

  override async delete(): Promise<void> {}

  override async metadata(spec: Spec): Promise<SpecMetadata | null> {
    const jsonKey = `${spec.name.toString()}/metadata.json`
    const legacyKey = `${spec.name.toString()}/.specd-metadata.yaml`
    const content = this._artifacts[jsonKey] ?? this._artifacts[legacyKey]
    if (content === undefined || content === null) return null
    return JSON.parse(content) as SpecMetadata
  }

  override async saveMetadata(_spec: Spec, content: string): Promise<void> {
    this.saved.set('metadata.json', content)
    this.saved.set('.specd-metadata.yaml', content)
  }

  override async readPersistedSchema(
    spec: Spec,
  ): Promise<{ name: string; version: number } | null> {
    const key = `${spec.name.toString()}/spec-lock.json`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    try {
      const parsed: Record<string, unknown> = JSON.parse(content)
      return (parsed.schema as { name: string; version: number } | undefined) ?? null
    } catch {
      return null
    }
  }

  override async readPersistedDependsOn(spec: Spec): Promise<readonly string[] | null> {
    const key = `${spec.name.toString()}/spec-lock.json`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    try {
      const parsed: Record<string, unknown> = JSON.parse(content)
      return (parsed.dependsOn as readonly string[] | undefined) ?? null
    } catch {
      return null
    }
  }

  override async readPersistedImplementation(
    spec: Spec,
  ): Promise<readonly { readonly file: string; readonly symbols?: readonly string[] }[] | null> {
    const key = `${spec.name.toString()}/spec-lock.json`
    const content = this._artifacts[key]
    if (content === undefined || content === null) return null
    try {
      const parsed: Record<string, unknown> = JSON.parse(content)
      return (
        (parsed.implementation as
          | readonly { readonly file: string; readonly symbols?: readonly string[] }[]
          | undefined) ?? null
      )
    } catch {
      return null
    }
  }

  override async updatePersistedSchema(): Promise<void> {}
  override async updatePersistedDependsOn(): Promise<void> {}
  override async updatePersistedImplementation(): Promise<void> {}

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
    async list(_options?: ArchiveListOptions): Promise<ArchiveListResult> {
      return {
        items: initial.map((c) => ({
          name: c.name,
          archivedName: c.archivedName,
          archivedAt: c.archivedAt,
          workspaces: c.workspaces,
          artifacts: [],
          specIds: [],
          schemaName: '',
          schemaVersion: 0,
        })),
        meta: {
          total: initial.length,
          count: initial.length,
          limit: 100,
        },
      }
    },
    async get(name: string): Promise<ArchivedChange | null> {
      return initial.find((c) => c.archivedName === name) ?? null
    },
    archivePath(entry: ArchivePathEntry) {
      return `/test/archive/${entry.archivedName}`
    },
    async reindex(): Promise<void> {},
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
        artifacts?: ArtifactType[]
        workflow?: WorkflowStep[]
        metadataExtraction?: MetadataExtraction
        crossArtifactValidations?: import('../../../src/domain/value-objects/cross-artifact-validation.js').CrossArtifactValidationRule[]
      } = [],
  workflow: WorkflowStep[] = [],
  overrides: {
    name?: string
    metadataExtraction?: MetadataExtraction
    crossArtifactValidations?: import('../../../src/domain/value-objects/cross-artifact-validation.js').CrossArtifactValidationRule[]
  } = {},
): Schema {
  if (Array.isArray(artifactsOrOpts)) {
    return new Schema(
      'schema',
      overrides.name ?? 'test-schema',
      1,
      artifactsOrOpts,
      workflow,
      overrides.metadataExtraction,
      overrides.crossArtifactValidations ?? [],
    )
  }
  return new Schema(
    'schema',
    artifactsOrOpts.name ?? 'test-schema',
    1,
    artifactsOrOpts.artifacts ?? [],
    artifactsOrOpts.workflow ?? [],
    artifactsOrOpts.metadataExtraction,
    artifactsOrOpts.crossArtifactValidations ?? [],
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
    run: async () => new HookResult(exitCode, '', ''),
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
        failedHook: null,
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

export function makeGenerateMetadata(): any {
  return { execute: async () => ({ hasExtraction: true, metadata: {} }) }
}

export function makeSaveMetadata(): any {
  return { execute: async () => ({ spec: 'test' }) }
}
