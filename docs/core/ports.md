# Ports

Ports are the interfaces between the application layer and the outside world. Each port represents a capability that use cases need — storing changes, reading specs, running shell hooks — without specifying how that capability is implemented.

To use `@specd/core` from your own adapter, you implement the ports it requires and inject them into the use case constructors. See [examples/implementing-a-port.md](examples/implementing-a-port.md) for a complete walkthrough.

All ports are exported from `@specd/core`.

---

## Kernel composition surface

The primary composition entrypoint remains `createKernel(config, options)`. `options` now supports additive registrations for storage factories, graph-store factories, artifact parsers, extractor transforms, VCS providers, actor providers, and external hook runners.

Built kernels expose the final merged registry as `kernel.registry`, so callers can inspect which built-in and additive capabilities are available after construction.

Graph-store selection follows the same additive pattern, but with a separate active-id choice:

- `graphStoreFactories` extends the set of available backends
- `graphStoreId` selects the single backend id that downstream code-graph composition should use for this kernel construction path

This is an internal composition concern. It is not a `specd.yaml` setting.

For incremental setup, `@specd/core` also exports `createKernelBuilder(config, base?)`. The builder accumulates the same additive registrations as `KernelOptions` and delegates `build()` to `createKernel(...)` with equivalent semantics.

```typescript
import { createKernelBuilder } from '@specd/core'

const kernel = await createKernelBuilder(config)
  .registerGraphStore('custom-sqlite', customSqliteFactory)
  .useGraphStore('sqlite')
  .registerParser('plaintext-plus', parser)
  .registerExtractorTransform('trim', async (value) => value.trim())
  .registerExternalHookRunner('http-runner', httpRunner)
  .build()

console.log(kernel.registry.graphStores.has('sqlite')) // true
console.log(kernel.registry.parsers.has('plaintext-plus')) // true
console.log(kernel.registry.extractorTransforms.has('trim')) // true
console.log(kernel.registry.externalHookRunners.has('http')) // true
```

Extractor transforms use the same additive merge rules as other kernel registries:

- built-ins such as `resolveSpecPath` are always registered first
- `createKernel(..., { extractorTransforms })` adds external transforms
- `createKernelBuilder(...).registerExtractorTransform(name, fn)` offers the fluent equivalent
- duplicate names fail kernel construction with `RegistryConflictError`
- transform callbacks may return either `string` or `Promise<string>`; the extraction runtime awaits them

---

## Repository base class

`Repository` is the abstract base class for `SpecRepository`, `ChangeRepository`, `ArchiveRepository`, and `SchemaRepository`. It encapsulates three invariants shared by every repository: workspace identity, ownership level, and locality.

```typescript
import { Repository, type RepositoryConfig } from '@specd/core'
```

### RepositoryConfig

```typescript
interface RepositoryConfig {
  workspace: string // workspace name from specd.yaml (e.g. 'billing', 'default')
  ownership: 'owned' | 'shared' | 'readOnly'
  isExternal: boolean // true if data lives outside the current git root
}
```

Ownership levels:

| Value        | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| `'owned'`    | Full control — no restrictions on reads or writes.                              |
| `'shared'`   | Writes are allowed but recorded in the change manifest as `touchedSharedSpecs`. |
| `'readOnly'` | No writes permitted. Data may only be read.                                     |

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

#### `metadata(spec: Spec): Promise<SpecMetadata | null>`

Returns the parsed metadata for the given spec, or `null` if no metadata file exists. The returned object includes an `originalHash` field (SHA-256 of the raw file content) for use in conflict detection when saving back.

#### `saveMetadata(spec: Spec, content: string, options?: { force?: boolean; originalHash?: string }): Promise<void>`

Persists raw YAML metadata content for a spec. Creates the metadata directory if it does not exist. When `originalHash` is provided and `force` is not `true`, the current file on disk is hashed and compared — a mismatch causes `ArtifactConflictError`.

**Throws:** `ArtifactConflictError` on hash mismatch when `force` is not set.

#### `resolveFromPath(inputPath: string, from?: SpecPath): Promise<ResolveFromPathResult | null>`

Resolves a storage path or relative spec link to a spec identity within this workspace. When `inputPath` is relative, `from` must be provided as the reference spec. Returns one of:

- `{ specPath, specId }` — resolved within this workspace.
- `{ crossWorkspaceHint }` — relative path escaped this workspace; try other repositories with the hint segments.
- `null` — not a valid spec link.

The built-in `resolveSpecPath` extractor transform consumes this contract through an application-level resolver: it resolves in the origin repository first, then uses `crossWorkspaceHint` plus workspace routes to try target repositories and confirm candidates with `get()`.

```typescript
export type ResolveFromPathResult =
  | { readonly specPath: SpecPath; readonly specId: string }
  | { readonly crossWorkspaceHint: readonly string[] }
```

---

## ChangeRepository

Port for reading and writing changes. Changes are persisted as a manifest (state, artifact hashes, approvals) separate from artifact file content. Use cases read and write artifact content via `artifact()` and `saveArtifact()` independently of manifest persistence.

Changes are stored globally — one `changes/` directory — not per-workspace. The inherited `workspace()`, `ownership()`, and `isExternal()` values carry default workspace settings and are not used by any use case.

```typescript
import { ChangeRepository, type RepositoryConfig } from '@specd/core'

abstract class ChangeRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `get(name: string): Promise<Change | null>`

Returns the change with the given name, or `null` if not found. Loads the manifest and derives each artifact's status by comparing the current file hash against the stored `validatedHash`. A hash mismatch indicates drift and resets the artifact status to `'in-progress'`.

`get()` is a snapshot read. It does not reserve the change for later persistence, so callers must not treat `get() -> mutate entity -> save()` as concurrency-safe.

```typescript
const change = await changeRepo.get('add-oauth-login')
```

#### `mutate<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T>`

Runs a serialized persisted mutation for one existing change. The repository acquires exclusive mutation access for the named change, reloads the fresh persisted state, invokes `fn(change)`, persists the manifest on success, and releases the lock.

This is the concurrency-safe path for read-modify-write operations on an existing change. Use cases that update lifecycle state, approvals, artifact completion, or `specDependsOn` should prefer `mutate()` over `get() -> save()`.

```typescript
const result = await changeRepo.mutate('add-oauth-login', (change) => {
  change.draft(actor, 'parking until next week')
  return change.state
})
```

#### `list(): Promise<Change[]>`

Lists all active (non-drafted, non-discarded) changes, sorted by creation order (oldest first). Returns `Change` objects with artifact state but without content.

#### `listDrafts(): Promise<Change[]>`

Lists all drafted (shelved) changes, sorted by creation order. Returns `Change` objects with artifact state but without content.

#### `listDiscarded(): Promise<Change[]>`

Lists all discarded changes, sorted by creation order. Returns `Change` objects with artifact state but without content.

#### `save(change: Change): Promise<void>`

Persists the change manifest — lifecycle state, artifact statuses, validated hashes, approvals, and `specDependsOn`. Does not write artifact file content; use `saveArtifact()` for that.

`save()` is a low-level manifest write. It is appropriate for first persistence of a new change or for repositories that already hold exclusive access. For existing persisted changes, use `mutate()` rather than composing `get()` and `save()` in application code.

#### `delete(change: Change): Promise<void>`

Deletes the entire change directory and all its contents.

#### `artifact(change: Change, filename: string): Promise<SpecArtifact | null>`

Loads the content of a single artifact file within a change. The returned `SpecArtifact` has `originalHash` set to the SHA-256 of the content on disk, enabling conflict detection if you later save it back.

```typescript
const artifact = await changeRepo.artifact(change, 'proposal.md')
```

#### `saveArtifact(change: Change, artifact: SpecArtifact, options?: { force?: boolean }): Promise<void>`

Writes an artifact file within a change directory. If `artifact.originalHash` is set and does not match the current file on disk, the save is rejected with `ArtifactConflictError`. After a successful write, the artifact's status in the in-memory `Change` is reset to `'in-progress'`; callers then persist the manifest separately, usually through `mutate()`.

**Throws:** `ArtifactConflictError` when a concurrent modification is detected and `force` is not set.

#### `changePath(change: Change): string`

Returns the absolute filesystem path to the active change directory. Used by use cases to build the `change.path` template variable.

#### `artifactExists(change: Change, filename: string): Promise<boolean>`

Returns `true` if the given artifact file exists within the change directory, without loading its content.

#### `deltaExists(change: Change, specId: string, filename: string): Promise<boolean>`

Returns `true` if the given delta file exists for the change and spec identifier, without loading its content.

#### `scaffold(change: Change, specExists: (specId: string) => Promise<boolean>): Promise<void>`

Ensures artifact directories exist for all files tracked by the change. For `scope: spec` artifacts, creates `specs/<ws>/<capPath>/` and `deltas/<ws>/<capPath>/` directories under the change directory. For `scope: change` artifacts, the root directory already exists.

#### `unscaffold(change: Change, specIds: readonly string[]): Promise<void>`

Removes the scaffolded spec directories for the given spec IDs from the change directory. For each spec ID, removes both `specs/<workspace>/<capability-path>/` and `deltas/<workspace>/<capability-path>/`. The operation is idempotent — missing directories are silently skipped.

---

## ArchiveRepository

Port for archiving and querying archived changes within a single workspace. The archive is append-only — once a change is archived it is never mutated. An `index.jsonl` file at the archive root provides fast lookup without scanning the filesystem.

```typescript
import { ArchiveRepository, type RepositoryConfig } from '@specd/core'

abstract class ArchiveRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `archive(change: Change, options?: { force?: boolean; actor?: ActorIdentity }): Promise<{ archivedChange: ArchivedChange; archiveDirPath: string }>`

Moves the change directory to the archive, creates the `ArchivedChange` record, persists its manifest, and appends an entry to `index.jsonl`. Returns both the `ArchivedChange` entity and the absolute path to the archived directory.

As a safety guard, the repository verifies that the change is in `archivable` state before proceeding. Pass `{ force: true }` to bypass this check for recovery or administrative operations. Pass `actor` to record the git identity of the actor performing the archive in the manifest.

**Throws:** `InvalidStateTransitionError` when the change is not in `archivable` state and `force` is not set.

#### `list(): Promise<ArchivedChange[]>`

Lists all archived changes in chronological order (oldest first). Streams `index.jsonl` and deduplicates by name.

#### `get(name: string): Promise<ArchivedChange | null>`

Returns the archived change with the given name, or `null`. Searches `index.jsonl` from the end (most recent first). Falls back to a filesystem scan if not found in the index, and appends the recovered entry to `index.jsonl` for future lookups.

#### `reindex(): Promise<void>`

Rebuilds `index.jsonl` by scanning the archive directory for all `manifest.json` files, sorting by `archivedAt`, and writing a clean index in chronological order. Use this to recover from a corrupted or missing index.

#### `archivePath(archivedChange: ArchivedChange): string`

Returns the absolute filesystem path to an archived change's directory. Mirrors `ChangeRepository.changePath()` for archived changes.

---

## SchemaRegistry

Port for discovering and resolving schemas by reference string. Unlike the repository ports, `SchemaRegistry` is a plain interface — no abstract base class.

Resolution is prefix-driven — no implicit multi-level fallback:

| `ref` form               | Resolves from                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `'@scope/name'`          | `node_modules/@scope/name/schema.yaml` (npm package)                                      |
| `'#workspace:name'`      | Delegated to the `SchemaRepository` for that workspace                                    |
| `'#name'` or bare name   | Equivalent to `#default:name` — delegated to the `default` workspace's `SchemaRepository` |
| relative / absolute path | Loaded directly from that path                                                            |

Implementations receive a `ReadonlyMap<string, SchemaRepository>` at construction time, mapping workspace names to their corresponding `SchemaRepository` instances.

```typescript
import { type SchemaRegistry, type SchemaEntry, type SchemaRawResult } from '@specd/core'
```

### Methods

#### `resolve(ref: string): Promise<Schema | null>`

Resolves a schema reference and returns the fully-parsed `Schema`. The `ref` value is the `schema` field from `specd.yaml` verbatim. Returns `null` if the resolved file does not exist — the caller is responsible for converting `null` to `SchemaNotFoundError`.

```typescript
const schema = await schemaRegistry.resolve('@specd/schema-std')
const schema = await schemaRegistry.resolve('#billing:my-schema')
```

#### `resolveRaw(ref: string): Promise<SchemaRawResult | null>`

Resolves a schema reference and returns the intermediate representation — parsed YAML data, loaded templates, and the resolved file path — without building the final domain `Schema`. Used internally by the extends-chain merge pipeline. Returns `null` if the file does not exist.

```typescript
interface SchemaRawResult {
  data: SchemaYamlData // parsed and validated intermediate data
  templates: ReadonlyMap<string, string> // loaded template content keyed by relative path
  resolvedPath: string // absolute path of the resolved schema file
}
```

#### `list(): Promise<SchemaEntry[]>`

Lists all schemas discoverable from workspace repositories and installed npm packages. Does not load or validate schema contents — use `resolve()` for that. Results are grouped: workspace entries first (in workspace declaration order), npm entries last.

```typescript
interface SchemaEntry {
  ref: string // pass this to resolve()
  name: string // display name without prefix or workspace qualifier
  source: 'npm' | 'workspace'
  workspace?: string // present when source === 'workspace'
}
```

---

## SchemaRepository

Port for reading and listing schemas within a single workspace. Each instance is bound to one workspace. `SchemaRegistry` delegates workspace schema resolution to instances of this port.

Extends `Repository` so that workspace identity, ownership, and locality are handled uniformly with other repository ports.

```typescript
import { SchemaRepository } from '@specd/core'

abstract class SchemaRepository extends Repository {
  constructor(config: RepositoryConfig)
}
```

### Methods

#### `resolve(name: string): Promise<Schema | null>`

Resolves a schema by name within this workspace and returns the fully-built `Schema` entity. Returns `null` if the schema does not exist.

```typescript
const schema = await schemaRepo.resolve('spec-driven')
```

#### `resolveRaw(name: string): Promise<SchemaRawResult | null>`

Resolves a schema by name and returns the intermediate representation without building the final domain `Schema`. Returns `null` if the schema does not exist.

#### `list(): Promise<SchemaEntry[]>`

Lists all schemas discoverable within this workspace. Does not load or validate schema file contents — only discovers available schemas and returns their metadata.

---

## SchemaProvider

A simplified schema port for use cases that need the fully-resolved schema for the current project but should not deal with reference routing or the extends-chain merge pipeline themselves.

Unlike `SchemaRegistry`, `SchemaProvider` has no parameters — it returns the pre-resolved schema for the active project configuration. Implementations may resolve lazily and cache the result.

```typescript
import { type SchemaProvider } from '@specd/core'
```

### Methods

#### `get(): Promise<Schema>`

Returns the fully-resolved schema for the current project configuration, including extends chains, plugins, and `schemaOverrides`.

**Throws:** `SchemaNotFoundError` if the schema reference cannot be resolved. `SchemaValidationError` if the resolved schema is invalid.

---

## HookRunner

Port for executing `run:` hook commands declared in `workflow[]` entries. Template variables in command strings are expanded before invoking the shell.

Unlike the repository ports, `HookRunner` is a plain interface — no abstract base class, no invariant constructor arguments.

```typescript
import { type HookRunner, type HookResult, type TemplateVariables } from '@specd/core'
```

### Methods

#### `run(command: string, variables: TemplateVariables): Promise<HookResult>`

Executes `command` in a subprocess, substituting template variables from `variables` before invoking the shell. Unknown variables are left unexpanded. All substituted values are shell-escaped to prevent injection.

Template variable syntax is `{{namespace.key}}`, e.g. `{{change.name}}`, `{{project.root}}`.

```typescript
type TemplateVariables = Record<string, Record<string, string | number | boolean>>

// Example shape:
const variables: TemplateVariables = {
  project: { root: '/Users/dev/my-project' },
  change: { name: 'add-auth', workspace: 'default', path: '...' },
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

`HookRunner` is shell-only. It does not execute `instruction:` hooks and it does not dispatch explicit external hooks.

---

## ExternalHookRunner

Port for executing explicit external workflow hooks declared as `external: { type, config }`.

Unlike `HookRunner`, external runners must declare the hook types they accept up front. The kernel builds an accepted-type index and dispatches each external hook to the matching runner. Unknown external hook types are rejected at runtime with a clear error.

```typescript
import {
  type ExternalHookRunner,
  type ExternalHookDefinition,
  type HookResult,
  type TemplateVariables,
} from '@specd/core'

interface ExternalHookRunner {
  readonly acceptedTypes: readonly string[]
  run(definition: ExternalHookDefinition, variables: TemplateVariables): Promise<HookResult>
}
```

---

## VcsAdapter

Port for querying version control system state. All methods are read-only — write operations (staging, committing, pushing) are intentionally excluded from v1 and are handled by `run:` hooks declared in `workflow[]`.

Unlike the repository ports, `VcsAdapter` is a plain interface — no abstract base class.

```typescript
import { type VcsAdapter } from '@specd/core'
```

### Methods

#### `rootDir(): Promise<string>`

Returns the absolute path to the root of the current VCS repository (the directory containing `.git/` for git). Useful for resolving all other project-relative paths.

**Throws** when the current working directory is not inside a VCS repository.

#### `branch(): Promise<string>`

Returns the name of the currently checked-out branch. Returns `'HEAD'` in detached HEAD state.

**Throws** when the current working directory is not inside a VCS repository.

#### `isClean(): Promise<boolean>`

Returns `true` when the working tree and index have no uncommitted changes. Used as a safety guard before archiving.

**Throws** when the current working directory is not inside a VCS repository.

#### `ref(): Promise<string | null>`

Returns the short revision identifier for the current commit or changeset. Returns `null` when VCS is unavailable or the repository has no commits yet.

#### `show(ref: string, filePath: string): Promise<string | null>`

Returns the content of a file at a given revision. Returns `null` when the revision or file path does not exist.

```typescript
const content = await vcsAdapter.show('abc1234', 'specs/default/auth/oauth/spec.md')
```

---

## ActorResolver

Port for resolving the identity of the current actor. Use cases record this identity in `ChangeEvent` history entries. Decoupled from any specific identity provider (git config, SSO, environment variables).

```typescript
import { type ActorResolver } from '@specd/core'
```

### Methods

#### `identity(): Promise<ActorIdentity>`

Returns the identity of the current actor as `{ name: string; email: string }`.

**Throws** when the identity cannot be determined (e.g. git `user.name` / `user.email` are not configured).

---

## FileReader

Port for reading arbitrary files from the filesystem by absolute path. Returns `null` when the file does not exist rather than throwing.

Unlike the repository ports, `FileReader` is a plain interface — no abstract base class.

```typescript
import { type FileReader } from '@specd/core'
```

### Methods

#### `read(absolutePath: string): Promise<string | null>`

Reads the UTF-8 text content of the file at `absolutePath`. Returns `null` if the file does not exist.

---

## ContentHasher

Port for computing deterministic content hashes. Implementations must be stable — the same content always produces the same hash string.

```typescript
import { ContentHasher } from '@specd/core'

abstract class ContentHasher {
  abstract hash(content: string): string
}
```

### Methods

#### `hash(content: string): string`

Computes a deterministic hash of the given string content. Returns a string in `algorithm:hex` format (e.g. `sha256:abc123…`).

---

## ConfigLoader

Port for loading and resolving the active `specd.yaml` configuration. Delivery mechanisms call `load()` once at startup and pass the resulting `SpecdConfig` to factory functions or use cases.

```typescript
import { type ConfigLoader } from '@specd/core'
```

### Methods

#### `load(): Promise<SpecdConfig>`

Loads, validates, and returns the fully-resolved project configuration with all paths made absolute.

**Throws:** `ConfigValidationError` when no config file is found or the YAML is invalid.

---

## ConfigWriter

Port for writing and mutating the project configuration (`specd.yaml`). Handles the operations that create or modify the on-disk configuration, unlike `ConfigLoader` which is read-only.

```typescript
import { type ConfigWriter, type InitProjectOptions, type InitProjectResult } from '@specd/core'
```

### Methods

#### `initProject(options: InitProjectOptions): Promise<InitProjectResult>`

Creates a new `specd.yaml` in `projectRoot`, creates the required storage directories, and appends `specd.local.yaml` to `.gitignore`.

```typescript
interface InitProjectOptions {
  projectRoot: string // directory to initialise (absolute path)
  schemaRef: string // schema reference (e.g. '@specd/schema-std')
  workspaceId: string // default workspace name (e.g. 'default')
  specsPath: string // relative path for the specs directory (e.g. 'specs/')
  force?: boolean // when true, overwrite an existing specd.yaml without error
}

interface InitProjectResult {
  configPath: string // absolute path to the created specd.yaml
  schemaRef: string // schema reference as written
  workspaces: readonly string[] // workspace IDs created
}
```

**Throws:** `AlreadyInitialisedError` when `specd.yaml` already exists and `force` is not set.

#### `recordSkillInstall(configPath: string, agent: string, skillNames: readonly string[]): Promise<void>`

Records that a skill set was installed for a given agent by merging the skill names into the `skills` key of `specd.yaml`.

```typescript
await configWriter.recordSkillInstall('/path/to/specd.yaml', 'claude', [
  'specd-core',
  'specd-review',
])
```

#### `readSkillsManifest(configPath: string): Promise<Record<string, string[]>>`

Reads the `skills` key from `specd.yaml` and returns it as a map of agent name to installed skill names. Returns `{}` if the key is absent.

```typescript
const manifest = await configWriter.readSkillsManifest('/path/to/specd.yaml')
// { claude: ['specd-core'], copilot: ['specd-core', 'specd-review'] }
```

---

## YamlSerializer

Port for YAML parsing and serialization. Keeps the application layer free from direct YAML library dependencies.

```typescript
import { YamlSerializer } from '@specd/core'

abstract class YamlSerializer {
  abstract parse(content: string): unknown
  abstract stringify(data: unknown): string
}
```

### Methods

#### `parse(content: string): unknown`

Parses a YAML string into a JavaScript value.

#### `stringify(data: unknown): string`

Serializes a JavaScript value into a YAML string.

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

```typescript
interface ArtifactAST {
  root: ArtifactNode
}

interface ArtifactNode {
  type: string
  label?: string
  value?: string | number | boolean | null
  children?: readonly ArtifactNode[]
  level?: number // present on markdown section nodes
  ordered?: boolean // present on markdown list nodes
  [key: string]: unknown
}
```

#### `apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST`

Applies a sequence of delta entries to an AST. All selectors are resolved before any operation is applied — if any selector fails to resolve (no match or ambiguous match), the entire application is rejected with `DeltaApplicationError`. Returns a new AST; the input is not mutated.

**Throws:** `DeltaApplicationError` on selector failure or structural conflict.

#### `serialize(ast: ArtifactAST): string`

Serializes an AST back to the artifact's native format string.

#### `renderSubtree(node: ArtifactNode): string`

Serializes a single AST node and all its descendants back to the artifact's native format string. Used by `ValidateArtifacts` to evaluate `contentMatches` rules and by the metadata extraction engine.

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

Parses a YAML delta file's raw content into a typed array of `DeltaEntry[]`. Called by `ValidateArtifacts` and `ArchiveChange` on the YAML adapter to convert raw delta files before passing them to `apply()`. Non-YAML adapters may return an empty array.

```typescript
interface DeltaEntry {
  op: 'added' | 'modified' | 'removed' | 'no-op'
  selector?: Selector
  position?: DeltaPosition
  rename?: string
  content?: string
  value?: unknown
  strategy?: 'replace' | 'append' | 'merge-by'
  mergeKey?: string
  description?: string // free-text, ignored during application
}
```
