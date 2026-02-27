# Example: Implementing a port

This guide walks through implementing two ports from scratch: `ChangeRepository` (an abstract class) and `GitAdapter` (a plain interface). It shows the full pattern for both kinds of port and how to wire them into a use case.

## The two port shapes

`@specd/core` ports come in two shapes:

- **Abstract classes** (`Repository`, `SpecRepository`, `ChangeRepository`, `ArchiveRepository`) — extend these and implement the abstract methods. The base class constructor sets `workspace`, `ownership`, and `isExternal` for you.
- **Interfaces** (`SchemaRegistry`, `HookRunner`, `GitAdapter`, `FileReader`, `ArtifactParser`) — implement these directly. No base class; just satisfy the interface.

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
}
```

### Key points

**`super(config)` is required.** The base `Repository` constructor sets the three invariants (`workspace`, `ownership`, `isExternal`). Always call it with a `RepositoryConfig` object.

**`RepositoryConfig` comes from the caller, not from the repository.** The repository does not read `specd.yaml` — the application layer resolves the config and passes it in. Your adapter's entry point (CLI command, MCP handler) is responsible for constructing the config from the resolved `specd.yaml`.

**Conflict detection is the repository's responsibility.** `ArtifactConflictError` is thrown by the repository when it detects a concurrent write. The use case does not do this check — only the repository has access to both the on-disk state and the `originalHash`.

**`save` vs `saveArtifact` are independent.** `save` persists the manifest (lifecycle state, artifact hashes, approvals). `saveArtifact` persists artifact file content. Use cases call them separately. Your repository must handle both independently.

---

## Implementing GitAdapter (interface)

This example implements a `GitAdapter` backed by the `simple-git` library.

```typescript
import { type GitAdapter, type GitIdentity } from '@specd/core'
import simpleGit from 'simple-git'

export class SimpleGitAdapter implements GitAdapter {
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

  async identity(): Promise<GitIdentity> {
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

**Interfaces have no base class.** Just implement the four methods. TypeScript will tell you if you miss one.

**All methods must throw when outside a git repository.** The contracts say so — do not return `null` or an empty string in that case. Let the underlying git error propagate, or wrap it in a descriptive `Error`.

**`identity()` must throw when `user.name` or `user.email` are missing.** The use cases that call it rely on the returned identity being complete. An empty string silently produces broken audit records.

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
        identifiedBy: ['matches'],
        description: 'A paragraph of text. `matches` is evaluated against the full text content.',
      },
      {
        type: 'line',
        identifiedBy: ['matches'],
        description: 'A single line within a paragraph.',
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
      'Use type: paragraph with matches: to target a paragraph by its content.',
      '',
      'Example:',
      '  - op: modified',
      '    selector:',
      '      type: paragraph',
      '      matches: "^This is the old content"',
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

Once you have your port implementations, inject them at the entry point of your adapter. For the built-in filesystem adapters, use the factory functions exported from `@specd/core`:

```typescript
import { CreateChange, GetStatus, TransitionChange, createChangeRepository } from '@specd/core'
import { SimpleGitAdapter } from './simple-git-adapter.js'

// Construct ports via factory — no concrete class imported
const git = new SimpleGitAdapter()

const changeRepo = createChangeRepository({
  type: 'fs',
  workspace: 'default',
  ownership: 'owned',
  isExternal: false,
  changesPath: '/path/to/specd/changes',
  draftsPath: '/path/to/specd/drafts',
  discardedPath: '/path/to/specd/discarded',
})

// Construct use cases — inject ports
const createChange = new CreateChange(changeRepo, git)
const getStatus = new GetStatus(changeRepo)
const transitionChange = new TransitionChange(changeRepo, git)

// Use them from your handler
const change = await createChange.execute({
  name: 'add-oauth-login',
  workspaces: ['default'],
  specIds: ['auth/oauth'],
  schemaName: 'spec-driven',
  schemaVersion: 1,
})

const status = await getStatus.execute({ name: 'add-oauth-login' })
console.log(status.change.state) // 'drafting'
console.log(status.artifactStatuses) // []
```

### Using a workspace map for multi-workspace use cases

`ArchiveChange`, `ValidateArtifacts`, and `CompileContext` accept a `ReadonlyMap<string, SpecRepository>` keyed by workspace name. Build the map using `createSpecRepository`, `createArchiveRepository`, and `createArtifactParserRegistry`:

```typescript
import {
  ArchiveChange,
  createChangeRepository,
  createSpecRepository,
  createArchiveRepository,
  createArtifactParserRegistry,
} from '@specd/core'

const changeRepo = createChangeRepository({
  type: 'fs',
  workspace: 'default',
  ownership: 'owned',
  isExternal: false,
  changesPath: '/path/to/specd/changes',
  draftsPath: '/path/to/specd/drafts',
  discardedPath: '/path/to/specd/discarded',
})

const specRepos = new Map([
  [
    'default',
    createSpecRepository({
      type: 'fs',
      workspace: 'default',
      ownership: 'owned',
      isExternal: false,
      specsPath: '/path/to/specs',
    }),
  ],
  [
    'billing',
    createSpecRepository({
      type: 'fs',
      workspace: 'billing',
      ownership: 'readOnly',
      isExternal: true,
      specsPath: '/path/to/billing-repo/specs',
    }),
  ],
])

const archiveRepo = createArchiveRepository({
  type: 'fs',
  workspace: 'default',
  ownership: 'owned',
  isExternal: false,
  changesPath: '/path/to/specd/changes',
  draftsPath: '/path/to/specd/drafts',
  archivePath: '/path/to/specd/archive',
})

const parsers = createArtifactParserRegistry()

const archiveChange = new ArchiveChange(
  changeRepo,
  specRepos,
  archiveRepo,
  hookRunner,
  git,
  parsers,
  schemaRegistry,
)
```

The use case looks up the correct `SpecRepository` for each workspace by name. If a workspace referenced in the change has no corresponding entry in the map, the use case will not be able to access its specs — make sure the map covers all workspaces declared in `specd.yaml`.

If you implement a custom adapter (e.g. database-backed), construct your class directly and pass it as the port type. The factories are conveniences for the built-in `'fs'` adapter, not a requirement for all implementations.
