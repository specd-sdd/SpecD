# Example: Implementing a port

This guide walks through implementing three ports from scratch: `ChangeRepository` (an abstract class), `VcsAdapter` (a plain interface), and `ActorResolver` (a plain interface). It shows the full pattern for both kinds of port and how to wire them into a use case.

## The two port shapes

`@specd/core` ports come in two shapes:

- **Abstract classes** (`Repository`, `SpecRepository`, `ChangeRepository`, `ArchiveRepository`) — extend these and implement the abstract methods. The base class constructor sets `workspace`, `ownership`, and `isExternal` for you.
- **Interfaces** (`SchemaRegistry`, `HookRunner`, `VcsAdapter`, `ActorResolver`, `FileReader`, `ArtifactParser`) — implement these directly. No base class; just satisfy the interface.

---

## Implementing ChangeRepository (abstract class)

This example implements a minimal in-memory `ChangeRepository` — useful for testing or for adapters that do not need persistence.

```typescript
import {
  ChangeRepository,
  type RepositoryConfig,
  type Change,
  type SpecArtifact,
  ArtifactConflictError,
} from '@specd/core'

export class InMemoryChangeRepository extends ChangeRepository {
  private readonly _changes = new Map<string, Change>()
  private readonly _artifacts = new Map<string, Map<string, SpecArtifact>>()

  constructor(config: RepositoryConfig) {
    super(config) // sets workspace(), ownership(), isExternal()
  }

  async get(name: string): Promise<Change | null> {
    return this._changes.get(name) ?? null
  }

  async list(): Promise<Change[]> {
    return [...this._changes.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async listDrafts(): Promise<Change[]> {
    return [] // in-memory adapter has no draft storage
  }

  async listDiscarded(): Promise<Change[]> {
    return [] // in-memory adapter has no discard storage
  }

  async save(change: Change): Promise<void> {
    this._changes.set(change.name, change)
  }

  async delete(change: Change): Promise<void> {
    this._changes.delete(change.name)
    this._artifacts.delete(change.name)
  }

  async artifact(change: Change, filename: string): Promise<SpecArtifact | null> {
    return this._artifacts.get(change.name)?.get(filename) ?? null
  }

  async saveArtifact(
    change: Change,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void> {
    if (!options?.force && artifact.originalHash !== undefined) {
      const existing = this._artifacts.get(change.name)?.get(artifact.filename)
      if (existing !== undefined && existing.originalHash !== artifact.originalHash) {
        throw new ArtifactConflictError(artifact.filename, artifact.content, existing.content)
      }
    }

    const changeArtifacts = this._artifacts.get(change.name) ?? new Map<string, SpecArtifact>()
    changeArtifacts.set(artifact.filename, artifact)
    this._artifacts.set(change.name, changeArtifacts)
  }

  changePath(_change: Change): string {
    return '/tmp/in-memory' // not meaningful for an in-memory adapter
  }

  async artifactExists(change: Change, filename: string): Promise<boolean> {
    return this._artifacts.get(change.name)?.has(filename) ?? false
  }

  async deltaExists(_change: Change, _specId: string, _filename: string): Promise<boolean> {
    return false
  }

  async scaffold(
    _change: Change,
    _specExists: (specId: string) => Promise<boolean>,
  ): Promise<void> {
    // no-op for in-memory adapter
  }

  async unscaffold(_change: Change, _specIds: readonly string[]): Promise<void> {
    // no-op for in-memory adapter
  }
}
```

### Key points

**`super(config)` is required.** The base `Repository` constructor sets the three invariants (`workspace`, `ownership`, `isExternal`). Always call it with a `RepositoryConfig` object.

**`RepositoryConfig` comes from the caller, not from the repository.** The repository does not read `specd.yaml` — the application layer resolves the config and passes it in. Your adapter's entry point (CLI command, MCP handler) is responsible for constructing the config from the resolved `specd.yaml`.

**Conflict detection is the repository's responsibility.** `ArtifactConflictError` is thrown by the repository when it detects a concurrent write. The use case does not do this check — only the repository has access to both the on-disk state and the `originalHash`.

**`save` vs `saveArtifact` are independent.** `save` persists the manifest (lifecycle state, artifact hashes, approvals). `saveArtifact` persists artifact file content. Use cases call them separately. Your repository must handle both independently.

---

## Implementing VcsAdapter (interface)

This example implements a `VcsAdapter` backed by the `simple-git` library. `VcsAdapter` covers read-only VCS operations: root directory, branch, clean status, revision ref, and file content at a revision.

```typescript
import { type VcsAdapter } from '@specd/core'
import simpleGit from 'simple-git'

export class SimpleVcsAdapter implements VcsAdapter {
  private readonly _git = simpleGit()

  async rootDir(): Promise<string> {
    const result = await this._git.revparse(['--show-toplevel'])
    return result.trim()
  }

  async branch(): Promise<string> {
    const result = await this._git.revparse(['--abbrev-ref', 'HEAD'])
    const name = result.trim()
    return name === 'HEAD' ? 'HEAD' : name
  }

  async isClean(): Promise<boolean> {
    const status = await this._git.status()
    return status.isClean()
  }

  async ref(): Promise<string | null> {
    try {
      const result = await this._git.revparse(['--short', 'HEAD'])
      return result.trim()
    } catch {
      return null
    }
  }

  async show(ref: string, filePath: string): Promise<string | null> {
    try {
      return await this._git.show([`${ref}:${filePath}`])
    } catch {
      return null
    }
  }
}
```

### Key points

**Interfaces have no base class.** Just implement all five methods. TypeScript will tell you if you miss one.

**All methods must throw when outside a git repository.** The contracts say so — do not return `null` or an empty string in that case. Let the underlying git error propagate, or wrap it in a descriptive `Error`.

---

## Implementing ActorResolver (interface)

`ActorResolver` resolves the identity of the current actor. This example resolves it from git config, but your adapter could use any source (environment variables, an auth token, etc.).

```typescript
import { type ActorResolver, type ActorIdentity } from '@specd/core'
import simpleGit from 'simple-git'

export class GitActorResolver implements ActorResolver {
  private readonly _git = simpleGit()

  async identity(): Promise<ActorIdentity> {
    const name = await this._git.raw(['config', 'user.name'])
    const email = await this._git.raw(['config', 'user.email'])

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName || !trimmedEmail) {
      throw new Error('git user.name and user.email must be configured')
    }

    return { name: trimmedName, email: trimmedEmail }
  }
}
```

### Key points

**`identity()` must throw when the actor cannot be determined.** The use cases that call it rely on the returned identity being complete. An empty string silently produces broken audit records.

---

## Implementing ArtifactParser (interface)

This is the most involved port. `ArtifactParser` abstracts parsing, delta application, and serialization for a single file format. Here is a skeleton that shows the required structure without a full implementation:

```typescript
import {
  type ArtifactParser,
  type ArtifactAST,
  type ArtifactNode,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
  DeltaApplicationError,
} from '@specd/core'

export class PlainTextParser implements ArtifactParser {
  readonly fileExtensions = ['.txt']

  parse(content: string): ArtifactAST {
    // Convert the raw string to a normalized ArtifactAST.
    // For plain text: split into paragraphs, each becomes an ArtifactNode.
    const paragraphs = content.split(/\n{2,}/).map(
      (text, i): ArtifactNode => ({
        type: 'paragraph',
        value: text.trim(),
      }),
    )
    return { root: { type: 'document', children: paragraphs } }
  }

  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    // Resolve all selectors before applying any operation.
    // Throw DeltaApplicationError if any selector fails.
    for (const entry of delta) {
      if (entry.selector !== undefined) {
        const matches = this._resolve(ast, entry.selector)
        if (matches.length === 0) {
          throw new DeltaApplicationError(
            `Selector did not match any node: ${JSON.stringify(entry.selector)}`,
          )
        }
        if (matches.length > 1) {
          throw new DeltaApplicationError(
            `Selector matched ${matches.length} nodes (expected 1): ${JSON.stringify(entry.selector)}`,
          )
        }
      }
    }
    // Apply operations in declaration order...
    return ast // placeholder
  }

  serialize(ast: ArtifactAST): string {
    // Convert AST back to the native format string.
    const paragraphs = ast.root.children ?? []
    return paragraphs.map((node) => node.value ?? '').join('\n\n')
  }

  renderSubtree(node: ArtifactNode): string {
    // Serialize a single node and its descendants.
    // For plain text paragraphs, just return the value.
    return node.value?.toString() ?? ''
  }

  nodeTypes(): readonly NodeTypeDescriptor[] {
    return [
      {
        type: 'document',
        identifiedBy: [],
        description: 'The root node of the plain text document.',
      },
      {
        type: 'paragraph',
        identifiedBy: ['contains'],
        description:
          'A block of text separated from other blocks by blank lines. `contains` is matched case-insensitively against the full paragraph content.',
      },
      {
        type: 'line',
        identifiedBy: ['contains'],
        description: 'A single line of text within a paragraph.',
      },
    ]
  }

  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const paragraphs = ast.root.children ?? []
    return paragraphs.map(
      (node, i): OutlineEntry => ({
        type: 'paragraph',
        label: `Paragraph ${i + 1}`,
        depth: 0,
      }),
    )
  }

  deltaInstructions(): string {
    return [
      'Plain text files use paragraph nodes as the addressable unit.',
      'Use type: paragraph with contains: to target a paragraph by its content.',
      '',
      'Example:',
      '  - op: modified',
      '    selector:',
      '      type: paragraph',
      '      contains: "old content"',
      '    content: |',
      '      This is the new content.',
    ].join('\n')
  }

  parseDelta(content: string): readonly DeltaEntry[] {
    // Only the YAML adapter is expected to return entries.
    // All other adapters return an empty array.
    return []
  }

  private _resolve(ast: ArtifactAST, selector: unknown): ArtifactNode[] {
    // Your selector resolution logic here.
    return []
  }
}
```

### Key points

**`apply` must resolve all selectors before applying any operation.** If any selector fails to resolve, throw `DeltaApplicationError` and leave the AST unchanged. The all-or-nothing guarantee is part of the port contract.

**`parseDelta` returns empty for non-YAML formats.** Only the YAML adapter parses delta files — all other adapters return `[]`. This is intentional: delta files are always YAML regardless of the target artifact format.

**`nodeTypes()` is static and format-specific.** It describes your format's addressable node types to the LLM. Make the `description` fields clear and precise — they appear verbatim in the AI context.

**`serialize(parse(content))` should be a near-identity.** Round-tripping through `parse` → `serialize` should produce content that is semantically equivalent to the input. For YAML files, the spec requires using a CST-level library that preserves comments and formatting.

---

## Wiring ports into a use case

The recommended entry point for delivery mechanisms is `createKernel(config)`. It accepts a fully-resolved `SpecdConfig` and returns all use cases pre-wired with their built-in `fs` adapters, grouped by domain area:

```typescript
import { createKernel, type SpecdConfig } from '@specd/core'

// config comes from FsConfigLoader (see below)
const kernel = createKernel(config)

// All use cases are ready to use
const { change } = await kernel.changes.create.execute({
  name: 'add-oauth-login',
  specIds: ['default:auth/oauth'],
  schemaName: 'spec-driven',
  schemaVersion: 1,
})

const status = await kernel.changes.status.execute({ name: 'add-oauth-login' })
console.log(status.change.state) // 'drafting'
console.log(status.artifactStatuses) // []
```

### Loading the config

Use `createConfigLoader` to discover and load `specd.yaml` before calling `createKernel`:

```typescript
import { createConfigLoader, createKernel } from '@specd/core'

// Discovery mode: walks up from CWD, bounded by the git root
const loader = createConfigLoader({ startDir: process.cwd() })
const config = await loader.load()
const kernel = createKernel(config)
```

When the CLI is invoked with `--config path/to/specd.yaml`, use forced mode instead:

```typescript
const loader = createConfigLoader({ configPath: options.config })
```

### Using a single use-case factory

If you only need one use case, call its factory directly instead of building the full kernel:

```typescript
import { createCreateChange, type SpecdConfig } from '@specd/core'

const createChange = createCreateChange(config)
const change = await createChange.execute({ name: 'add-oauth-login', … })
```

### Explicit (context + options) form

Each factory also accepts an explicit context and options object — useful for custom paths in tests or integration scenarios:

```typescript
import { createCreateChange } from '@specd/core'

const createChange = createCreateChange(
  { workspace: 'default', ownership: 'owned', isExternal: false },
  {
    changesPath: '/tmp/test/changes',
    draftsPath: '/tmp/test/drafts',
    discardedPath: '/tmp/test/discarded',
  },
)
```

### Custom adapters

If you implement a custom adapter (e.g. database-backed), construct your class directly and pass it to the use case constructor — the factories wire the built-in `fs` adapters only:

```typescript
import { CreateChange } from '@specd/core'
import { MyDbChangeRepository } from './my-db-change-repository.js'
import { MyActorResolver } from './my-actor-resolver.js'

const changeRepo = new MyDbChangeRepository(…)
const actor = new MyActorResolver()
const createChange = new CreateChange(changeRepo, new Map(), actor)
```
