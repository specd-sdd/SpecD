import { Change, type GitIdentity } from '../../../src/domain/entities/change.js'
import { type Spec } from '../../../src/domain/entities/spec.js'
import { type SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type SpecRepository } from '../../../src/application/ports/spec-repository.js'
import { type SchemaRegistry, type Schema } from '../../../src/application/ports/schema-registry.js'
import { type FileReader } from '../../../src/application/ports/file-reader.js'
import { type HookRunner } from '../../../src/application/ports/hook-runner.js'
import { HookResult } from '../../../src/domain/value-objects/hook-result.js'
import { type GitAdapter } from '../../../src/application/ports/git-adapter.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'

/** Default git identity for test actors. */
export const testActor: GitIdentity = { name: 'Test User', email: 'test@example.com' }

/**
 * Creates a fully-typed mock `ChangeRepository` backed by an in-memory map.
 *
 * `get`, `list`, `save`, and `delete` are wired to the map. `artifact` and
 * `saveArtifact` throw `'not implemented'` — override in specific tests that
 * need them.
 */
export function makeChangeRepository(
  initial: Change[] = [],
): ChangeRepository & { store: Map<string, Change> } {
  const store = new Map<string, Change>(initial.map((c) => [c.name, c]))

  const repo = {
    store,
    workspace() {
      return 'default'
    },
    ownership() {
      return 'owned' as const
    },
    isExternal() {
      return false
    },
    async get(name: string): Promise<Change | null> {
      return store.get(name) ?? null
    },
    async list(): Promise<Change[]> {
      return [...store.values()]
    },
    async listDrafts(): Promise<Change[]> {
      throw new Error('not implemented')
    },
    async listDiscarded(): Promise<Change[]> {
      throw new Error('not implemented')
    },
    async save(change: Change): Promise<void> {
      store.set(change.name, change)
    },
    async delete(change: Change): Promise<void> {
      store.delete(change.name)
    },
    async artifact(_change: Change, _filename: string): Promise<SpecArtifact | null> {
      throw new Error('not implemented')
    },
    async saveArtifact(
      _change: Change,
      _artifact: SpecArtifact,
      _options?: { force?: boolean },
    ): Promise<void> {
      throw new Error('not implemented')
    },
  }

  return repo as unknown as ChangeRepository & { store: Map<string, Change> }
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
 * Creates a mock `SpecRepository` backed by in-memory arrays.
 *
 * All abstract methods are implemented. `save` and `delete` are no-ops by
 * default — override via the `overrides` parameter for specific tests.
 */
export function makeSpecRepository(
  overrides: {
    specs?: Spec[]
    artifacts?: Record<string, string | null>
    save?: (spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }) => Promise<void>
    delete?: (spec: Spec) => Promise<void>
  } = {},
): SpecRepository {
  const specs = overrides.specs ?? []
  const artifacts = overrides.artifacts ?? {}

  const repo = {
    workspace() {
      return 'default'
    },
    ownership() {
      return 'owned' as const
    },
    isExternal() {
      return false
    },
    async get(name: SpecPath): Promise<Spec | null> {
      return specs.find((s) => s.name.toString() === name.toString()) ?? null
    },
    async list(prefix?: SpecPath): Promise<Spec[]> {
      if (prefix === undefined) return specs
      const prefixStr = prefix.toString()
      return specs.filter((s) => {
        const p = s.name.toString()
        return p === prefixStr || p.startsWith(`${prefixStr}/`)
      })
    },
    async artifact(_spec: Spec, filename: string): Promise<SpecArtifact | null> {
      const key = `${_spec.name.toString()}/${filename}`
      const content = artifacts[key]
      if (content === undefined || content === null) return null
      return new SpecArtifact(filename, content)
    },
    async save(spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }): Promise<void> {
      if (overrides.save) return overrides.save(spec, artifact, options)
    },
    async delete(spec: Spec): Promise<void> {
      if (overrides.delete) return overrides.delete(spec)
    },
  }
  return repo as unknown as SpecRepository
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
