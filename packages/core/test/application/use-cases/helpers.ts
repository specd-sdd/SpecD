import { Change, type GitIdentity } from '../../../src/domain/entities/change.js'
import { type Spec } from '../../../src/domain/entities/spec.js'
import { type SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import {
  ArtifactType,
  type ArtifactTypeProps,
} from '../../../src/domain/value-objects/artifact-type.js'
import { Schema } from '../../../src/domain/value-objects/schema.js'
import { type WorkflowStep } from '../../../src/domain/value-objects/workflow-step.js'
import { ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type SchemaRegistry } from '../../../src/application/ports/schema-registry.js'
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactAST,
  type ArtifactNode,
  type DeltaEntry,
} from '../../../src/application/ports/artifact-parser.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { type HookRunner } from '../../../src/application/ports/hook-runner.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import { type GitAdapter } from '../../../src/application/ports/git-adapter.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'

/** Default git identity for test actors. */
export const testActor: GitIdentity = { name: 'Test User', email: 'test@example.com' }

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
    super({ workspace: 'default', ownership: 'owned', isExternal: false })
    this.store = new Map(changes.map((c) => [c.name, c]))
  }

  override async get(name: string): Promise<Change | null> {
    return this.store.get(name) ?? null
  }

  override async list(): Promise<Change[]> {
    return [...this.store.values()]
  }

  override async listDrafts(): Promise<Change[]> {
    throw new Error('not implemented')
  }

  override async listDiscarded(): Promise<Change[]> {
    throw new Error('not implemented')
  }

  override async save(change: Change): Promise<void> {
    this.store.set(change.name, change)
  }

  override async delete(change: Change): Promise<void> {
    this.store.delete(change.name)
  }

  override async artifact(_change: Change, _filename: string): Promise<SpecArtifact | null> {
    throw new Error('not implemented')
  }

  override async saveArtifact(
    _change: Change,
    _artifact: SpecArtifact,
    _options?: { force?: boolean },
  ): Promise<void> {
    throw new Error('not implemented')
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
 * Creates a fully-typed mock `GitAdapter`.
 *
 * Returns sensible defaults. Override individual methods as needed.
 */
export function makeGitAdapter(overrides: Partial<GitAdapter> = {}): GitAdapter {
  return {
    async rootDir(): Promise<string> {
      return '/repo'
    },
    async branch(): Promise<string> {
      return 'main'
    },
    async isClean(): Promise<boolean> {
      return true
    },
    async identity(): Promise<GitIdentity> {
      return testActor
    },
    ...overrides,
  }
}

/**
 * Builds a minimal `Change` in `drafting` state for use in tests.
 */
export function makeChange(
  name: string,
  opts: { workspaces?: string[]; specIds?: string[] } = {},
): Change {
  return new Change({
    name,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    workspaces: opts.workspaces ?? ['default'],
    specIds: opts.specIds ?? ['auth/login'],
    history: [],
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
  private readonly _deleteFn: ((spec: Spec) => Promise<void>) | undefined
  readonly saved = new Map<string, string>()

  constructor(opts: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    save?: (spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>
    delete?: (spec: Spec) => Promise<void>
  }) {
    super({ workspace: 'default', ownership: 'owned', isExternal: false })
    this._specs = opts.specs ?? []
    this._artifacts = opts.artifacts ?? {}
    this._saveFn = opts.save
    this._deleteFn = opts.delete
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

  override async delete(spec: Spec): Promise<void> {
    if (this._deleteFn) return this._deleteFn(spec)
  }
}

/**
 * Creates a `SpecRepository` backed by in-memory arrays.
 */
export function makeSpecRepository(
  overrides: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    save?: (spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>
    delete?: (spec: Spec) => Promise<void>
  } = {},
): SpecRepository & { saved: Map<string, string> } {
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
    async list() {
      return []
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
  return new ArtifactType({
    id,
    scope: 'change',
    output: `${id}.md`,
    requires: [],
    validations: [],
    deltaValidations: [],
    contextSections: [],
    preHashCleanup: [],
    ...extra,
  })
}

/**
 * Creates a `Schema` with the given artifact types and workflow steps.
 *
 * Accepts either an options object or a plain array of artifact types.
 */
export function makeSchema(
  optsOrArtifacts:
    | { artifacts?: ArtifactType[]; workflow?: WorkflowStep[]; name?: string }
    | ArtifactType[] = {},
  workflow: WorkflowStep[] = [],
): Schema {
  if (Array.isArray(optsOrArtifacts)) {
    return new Schema('test-schema', 1, optsOrArtifacts, workflow)
  }
  return new Schema(
    optsOrArtifacts.name ?? 'test-schema',
    1,
    optsOrArtifacts.artifacts ?? [],
    optsOrArtifacts.workflow ?? [],
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
    apply?: (ast: ArtifactAST, delta: readonly DeltaEntry[]) => ArtifactAST
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
    apply: opts.apply ?? ((ast) => ast),
    serialize: opts.serialize ?? (() => 'serialized'),
    renderSubtree: opts.renderSubtree ?? (() => 'rendered'),
    nodeTypes: () => [],
    outline: () => [],
    deltaInstructions: () => '',
    parseDelta: opts.parseDelta ?? (() => []),
  }
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
