import { Change, type GitIdentity } from '../../../src/domain/entities/change.js'
import { type ChangeRepository } from '../../../src/application/ports/change-repository.js'
import { type GitAdapter } from '../../../src/application/ports/git-adapter.js'
import { type SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'

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
      return 'project' as const
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
