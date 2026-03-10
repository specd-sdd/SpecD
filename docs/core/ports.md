# Ports

Ports are the interfaces between the application layer and the outside world. Each port represents a capability that use cases need — storing changes, reading specs, executing shell commands — without specifying how that capability is implemented.

To use `@specd/core` from your own adapter, you implement the ports it requires and inject them into the use case constructors. See [examples/implementing-a-port.md](examples/implementing-a-port.md) for a complete walkthrough.

All ports are exported from `@specd/core`.

## Repository base class

`Repository` is the abstract base class for all four repository ports. It encapsulates three invariants shared by every repository: workspace, ownership, and locality.

```typescript
import { Repository, type RepositoryConfig } from '@specd/core'
```

### RepositoryConfig

```typescript
interface RepositoryConfig {
  workspace: string // workspace name from specd.yaml
  ownership: 'owned' | 'shared' | 'readOnly'
  isExternal: boolean // true if specs live outside the git root
}
```

### Methods inherited by all repositories

| Method         | Returns                             | Description                                                          |
| -------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `workspace()`  | `string`                            | The workspace name this repository is bound to.                      |
| `ownership()`  | `'owned' \| 'shared' \| 'readOnly'` | The ownership level declared in `specd.yaml`.                        |
| `isExternal()` | `boolean`                           | Whether this repository points to data outside the current git root. |

---

## SpecRepository

Port for reading and writing specs within a single workspace. Each workspace gets its own `SpecRepository` instance. Use cases that span multiple workspaces receive one instance per workspace, passed as a `ReadonlyMap<string, SpecRepository>`.

`list` and `get` return lightweight `Spec` metadata without loading content. Content is fetched explicitly via `artifact()`.

```typescript
import { SpecRepository, type RepositoryConfig } from '@specd/core'

abstract class SpecRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `get(name: SpecPath): Promise<Spec | null>`

Returns the spec metadata for the given path, or `null` if no such spec exists.

```typescript
const spec = await specRepo.get(SpecPath.parse('auth/oauth'))
if (spec === null) {
  /* spec does not exist */
}
```

#### `list(prefix?: SpecPath): Promise<Spec[]>`

Lists all specs in this workspace, optionally filtered to those under `prefix`. Returns lightweight `Spec` objects — no artifact content is loaded.

```typescript
const allSpecs = await specRepo.list()
const authSpecs = await specRepo.list(SpecPath.parse('auth'))
```

#### `artifact(spec: Spec, filename: string): Promise<SpecArtifact | null>`

Loads the content of a single artifact file within a spec. Returns `null` if the file does not exist.

```typescript
const artifact = await specRepo.artifact(spec, 'spec.md')
if (artifact !== null) {
  console.log(artifact.content)
}
```

#### `save(spec: Spec, artifact: SpecArtifact, options?: { force?: boolean }): Promise<void>`

Persists a single artifact file. Creates the spec directory if it does not exist.

If `artifact.originalHash` is set and does not match the current file on disk, the save is rejected with `ArtifactConflictError` to prevent silently overwriting concurrent changes. Pass `{ force: true }` to overwrite unconditionally.

```typescript
await specRepo.save(spec, artifact)
await specRepo.save(spec, artifact, { force: true }) // bypass conflict detection
```

**Throws:** `ArtifactConflictError` when a concurrent modification is detected and `force` is not set.

#### `delete(spec: Spec): Promise<void>`

Deletes the entire spec directory and all its artifact files.

---

## ChangeRepository

Port for reading and writing changes within a single workspace. Changes are persisted as a manifest (state, hashes, approvals) separate from artifact file content. Use cases that need to read or write artifact content call `artifact()` and `saveArtifact()` separately from `save()`.

```typescript
import { ChangeRepository, type RepositoryConfig } from '@specd/core'

abstract class ChangeRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `get(name: string): Promise<Change | null>`

Returns the change with the given name, or `null` if not found. Loads the manifest and derives each artifact's status by comparing the current file hash against the stored `validatedHash`. A mismatch resets the artifact to `'in-progress'`.

```typescript
const change = await changeRepo.get('add-oauth-login')
```

#### `list(): Promise<Change[]>`

Lists all changes in this workspace, sorted by creation order (oldest first). Returns `Change` objects with artifact state but without content.

#### `save(change: Change): Promise<void>`

Persists the change manifest — lifecycle state, artifact hashes, and approvals. Does not write artifact file content; use `saveArtifact()` for that.

#### `delete(change: Change): Promise<void>`

Deletes the entire change directory and all its contents.

#### `artifact(change: Change, filename: string): Promise<SpecArtifact | null>`

Loads the content of a single artifact file within a change. The returned `SpecArtifact` has `originalHash` set to the SHA-256 of the content on disk, enabling conflict detection if you later save it back.

```typescript
const artifact = await changeRepo.artifact(change, 'proposal.md')
```

#### `saveArtifact(change: Change, artifact: SpecArtifact, options?: { force?: boolean }): Promise<void>`

Writes an artifact file within a change directory. If `artifact.originalHash` is set and does not match the current file on disk, the save is rejected with `ArtifactConflictError`. After a successful write, the artifact's status in the change manifest is reset to `'in-progress'` — call `save(change)` to persist that state change.

**Throws:** `ArtifactConflictError` when a concurrent modification is detected and `force` is not set.

---

## ArchiveRepository

Port for archiving and querying archived changes within a single workspace. The archive is append-only — once a change is archived it is never mutated. An `index.jsonl` file provides fast lookup without scanning the directory.

```typescript
import { ArchiveRepository, type RepositoryConfig } from '@specd/core'

abstract class ArchiveRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `archive(change: Change, options?: { force?: boolean }): Promise<ArchivedChange>`

Moves the change directory to the archive, creates the `ArchivedChange` record, persists its manifest, and appends an entry to `index.jsonl`.

As a safety guard, the repository verifies that the change is in `archivable` state before proceeding. Pass `{ force: true }` to bypass this check for recovery or administrative operations.

**Throws:** `InvalidStateTransitionError` when the change is not in `archivable` state and `force` is not set.

#### `list(): Promise<ArchivedChange[]>`

Lists all archived changes in chronological order (oldest first). Streams `index.jsonl` and deduplicates by name.

#### `get(name: string): Promise<ArchivedChange | null>`

Returns the archived change with the given name, or `null`. Searches `index.jsonl` from the end (most recent first). Falls back to a filesystem scan if not found in the index, and appends the recovered entry to `index.jsonl` for future lookups.

#### `reindex(): Promise<void>`

Rebuilds `index.jsonl` by scanning the archive directory for all `manifest.json` files. Use this to recover from a corrupted or missing index.

---

## SchemaRegistry

Port for discovering and resolving schemas. Unlike the repository ports, `SchemaRegistry` is a plain interface — no abstract base class, no invariant constructor arguments.

```typescript
import { type SchemaRegistry, type SchemaEntry } from '@specd/core'
```

### Methods

#### `resolve(ref: string, workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<Schema | null>`

Resolves a schema reference and returns the fully-parsed `Schema`. The `ref` is the `schema` field from `specd.yaml` verbatim. `workspaceSchemasPaths` is a map of workspace name → resolved `schemasPath`, derived from config by the application layer.

Returns `null` if the resolved file does not exist. The caller is responsible for converting `null` to `SchemaNotFoundError`.

Resolution is prefix-driven — no implicit fallback:

| `ref` form                | Resolves from                                             |
| ------------------------- | --------------------------------------------------------- |
| `'@scope/name'`           | `node_modules/@scope/name/schema.yaml`                    |
| `'#workspace:name'`       | `workspaceSchemasPaths.get('workspace')/name/schema.yaml` |
| `'#name'` or bare name    | `workspaceSchemasPaths.get('default')/name/schema.yaml`   |
| relative or absolute path | directly from that path                                   |

#### `list(workspaceSchemasPaths: ReadonlyMap<string, string>): Promise<SchemaEntry[]>`

Lists all schemas discoverable from the given workspace paths and installed npm packages. Does not load schema contents — use `resolve()` for that. Results are grouped: workspace entries first, npm entries last.

```typescript
interface SchemaEntry {
  ref: string // pass this to resolve()
  name: string // display name
  source: 'npm' | 'workspace'
  workspace?: string // present when source === 'workspace'
}
```

---

## HookRunner

Port for executing `run:` hook commands declared in `workflow[]` entries. The hook runner substitutes template variables before invoking the shell.

```typescript
import { type HookRunner, type HookResult, type HookVariables } from '@specd/core'
```

### Methods

#### `run(command: string, variables: HookVariables): Promise<HookResult>`

Executes `command` in a subprocess, substituting template variables from `variables` before invoking the shell. Unknown variables are left unexpanded.

```typescript
interface HookVariables {
  'change.name': string
  'change.workspace': string
  codeRoot: string
  [key: string]: string
}

interface HookResult {
  exitCode: number
  stdout: string
  stderr: string
}
```

**Execution guarantees by lifecycle point:**

- `pre-*` hooks — guaranteed. A non-zero exit code causes the use case to throw `HookFailedError`, aborting the operation.
- `post-*` hooks on CLI-owned operations (`archive`, `validate`) — guaranteed. The operation has already completed; failures are surfaced as warnings, not errors.
- `post-*` hooks on agent-driven operations — not supported in v1. Use `instruction:` hooks instead.

---

## GitAdapter

Port for querying git repository state. All methods are read-only — write operations (staging, committing, pushing) are intentionally excluded from v1. They are handled by `run:` hooks declared in `workflow[]`.

```typescript
import { type GitAdapter } from '@specd/core'
```

### Methods

#### `rootDir(): Promise<string>`

Returns the absolute path to the root of the current git repository (the directory containing `.git/`). **Throws** when not inside a git repository.

#### `branch(): Promise<string>`

Returns the name of the currently checked-out branch. Returns `'HEAD'` in detached HEAD state. **Throws** when not inside a git repository.

#### `isClean(): Promise<boolean>`

Returns `true` when the working tree and index have no uncommitted changes. Used as a safety guard before archiving. **Throws** when not inside a git repository.

---

## ActorResolver

Port for resolving the identity of the current actor. Use cases record this identity in `ChangeEvent` history entries.

```typescript
import { type ActorResolver } from '@specd/core'
```

### Methods

#### `identity(): Promise<ActorIdentity>`

Returns the identity of the current actor. **Throws** when the identity cannot be determined (e.g. git `user.name` / `user.email` are not configured).

---

## FileReader

Port for reading arbitrary files from the filesystem by absolute path. Returns `null` when the file does not exist rather than throwing.

```typescript
import { type FileReader } from '@specd/core'
```

### Methods

#### `read(absolutePath: string): Promise<string | null>`

Reads the UTF-8 text content of the file at `absolutePath`. Returns `null` if the file does not exist.

---

## ArtifactParser and ArtifactParserRegistry

`ArtifactParser` is the port that abstracts all file-type-specific operations: parsing, delta application, serialization, and context extraction. Each supported file format (markdown, JSON, YAML, plain text) has a corresponding implementation.

`ArtifactParserRegistry` is a `ReadonlyMap<string, ArtifactParser>` keyed by format name: `'markdown'`, `'json'`, `'yaml'`, `'plaintext'`.

```typescript
import {
  type ArtifactParser,
  type ArtifactParserRegistry,
  type ArtifactAST,
  type ArtifactNode,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
  DeltaApplicationError,
} from '@specd/core'
```

### Properties

| Property         | Type                | Description                                            |
| ---------------- | ------------------- | ------------------------------------------------------ |
| `fileExtensions` | `readonly string[]` | File extensions this adapter handles (e.g. `['.md']`). |

### Methods

#### `parse(content: string): ArtifactAST`

Parses artifact content into a normalized AST.

#### `apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST`

Applies a sequence of delta entries to an AST. All selectors are resolved before any operation is applied — if any selector fails to resolve (no match or ambiguous match), the entire application is rejected with `DeltaApplicationError`. Returns a new AST; the input is not mutated.

**Throws:** `DeltaApplicationError` on selector failure or structural conflict.

#### `serialize(ast: ArtifactAST): string`

Serializes an AST back to the artifact's native format string.

#### `renderSubtree(node: ArtifactNode): string`

Serializes a single AST node and all its descendants back to the artifact's native format string. Used by `ValidateArtifacts` to evaluate `contentMatches` and by `CompileContext` to extract spec content via `contextSections`.

#### `nodeTypes(): readonly NodeTypeDescriptor[]`

Returns a static description of all addressable node types for this format. `CompileContext` injects these into the LLM context when generating delta files.

```typescript
interface NodeTypeDescriptor {
  type: string // e.g. 'section', 'property'
  identifiedBy: readonly string[] // selector properties, e.g. ['matches']
  description: string // human-readable, for LLM context
}
```

#### `outline(ast: ArtifactAST): readonly OutlineEntry[]`

Returns a simplified navigable summary of the artifact's addressable nodes. `CompileContext` injects this when asking the LLM to generate a delta.

```typescript
interface OutlineEntry {
  type: string
  label: string // e.g. heading text or key name
  depth: number // 0 = root children
  children?: readonly OutlineEntry[]
}
```

#### `deltaInstructions(): string`

Returns a format-specific static text block that `CompileContext` injects verbatim when `delta: true` is active for an artifact. Explains the selector vocabulary, `content` vs `value` semantics, and a concrete example for this format.

#### `parseDelta(content: string): readonly DeltaEntry[]`

Parses a YAML delta file's raw content into a typed array of `DeltaEntry[]`. Called by `ValidateArtifacts` and `ArchiveChange` on the YAML adapter to convert the raw delta file before passing to `apply()`. Non-YAML adapters may return an empty array.
