# Proposal: persist-spec-context-optimizations

## Motivations

Spec context optimizations are durable authoring decisions, but today they live in generated `metadata.json`. Generated metadata must remain a reproducible, schema-independent consumer projection rather than the source of truth, and consumers must never serve an optimization after its source artifacts have changed.

Once external metadata editors are removed, metadata can also become a self-healing materialized cache: normal reads should not require a preceding manual generation command.

## Current behaviour

`UpdateSpecMetadata` merges `optimizedDescription` and `optimizedContext` directly into metadata and marks the document as agent-generated. Metadata can also be injected, overwritten, or invalidated through public Core APIs and CLI commands.

`spec-lock.json` already owns schema identity, canonical `dependsOn`, and implementation links. It does not own optimized context or the artifact baseline needed to determine whether an optimization is stale.

Metadata freshness is currently split between repository and use-case code. It compares recorded artifact hashes and selected persisted fields, but does not prove that a projection was generated from the current lock. Consumers react differently to missing or stale metadata, and users must run `generate-metadata` manually before commands can rely on the normalized projection.

This manual requirement originally protected metadata that agents could edit. It no longer has a valid purpose after removing those writers. It also makes a fresh clone or a deleted cache incomplete until a separate maintenance command is run.

## Proposed solution

Make `spec-lock.json` the sole durable source for spec optimizations. Each optimized field owns the artifact baseline from which its value was produced, so `optimizedDescription` and `optimizedContext` can become stale independently. Content hashes are authoritative; `lastModified` is diagnostic only.

Keep metadata persistence on `SpecRepository`. A filesystem repository may store it under `.specd/metadata`, while a database repository may store it in a table or document alongside the spec. `readMetadataSnapshot()` reads the exact persisted observation and `writeMetadataSnapshot()` conditionally replaces it, but the repository neither generates metadata nor decides whether it is fresh.

Move freshness and regeneration policy to Core application services:

- `GenerateSpecMetadata` remains a deterministic, non-writing projection.
- `MaterializeSpecMetadata` compares persisted metadata provenance with the current source state. It reuses fresh metadata and regenerates missing, invalid, or stale metadata.
- `GetSpecMetadata` provides the normal self-healing read contract.
- `RegenerateSpecMetadata` is the explicit forced, optionally batched rebuild used by `specs generate-metadata`.

Every public operation introduced by this change follows the established Core
use-case and composition conventions: typed input/result contracts, an async
`execute()` method, explicit constructor dependencies, overloaded `create*`
factories for dependency injection or config bootstrap, resolver integration, Core
public exports, `Kernel.specs` exposure, and SDK re-export. CLI handlers never
construct repositories or reproduce orchestration.

Normal consumers materialize metadata internally when they need the normalized projection. `generate-metadata` remains available for force rebuilding, cache warming, repair, CI, and diagnostics, but is not part of the correctness workflow after a lock mutation.

Persisted-state mutation use cases and `ArchiveChange` share one pure constructor that
applies a patch to either an existing aggregate snapshot or an explicit initial base.
Repositories receive and conditionally persist complete semantic state. The filesystem
adapter alone owns canonical `spec-lock.json` serialization and atomic/staged writes;
it never derives schema identity, dependencies, or fallback values.

Generated filesystem metadata is a disposable cache. New projects create its directory and add `/.specd/metadata/` to the project-root `.gitignore`. Existing tracked metadata requires an explicit one-time repository migration because adding an ignore entry does not untrack files.

Add sectioned CLI families whose handlers only parse input, call Core use cases, format output, and map errors:

- `specs init <spec-id>|--all [--schema <ref>]`
- `specs schema get|set`
- `specs deps list|add|remove|set|clear`
- `specs implementation list|add|remove`, matching `changes implementation`
- `specs optimizations get|set|clear`

Remove `update-metadata`, `write-metadata`, and `invalidate-metadata`. Metadata has no external editor after this change.

Optimizer agents must first inspect the effective project configuration. They invoke persisted optimization commands only when `llmOptimizedContext === true`; when it is `false`, missing or stale optimization data is not a request to optimize and must not cause any metadata or lock write.

## Specs affected

### New specs

- `core:spec-optimization`: durable per-field optimization state, artifact and schema baselines, freshness statuses, and diagnostic reasons.
  - Depends on: `core:spec-lock`, `core:spec-repository-port`
- `core:materialize-spec-metadata`: shared self-healing and forced materialization policy, including freshness comparison and concurrency guards.
  - Depends on: `core:spec-repository-port`, `core:generate-metadata`, `core:persist-spec-metadata`, `core:spec-metadata`, `core:composition-resolver`, `default:_global/logging`
- `core:persist-spec-metadata`: internal validation and guarded persistence service for one complete generated metadata projection; it is deliberately not a public metadata-editing use case.
  - Depends on: `core:spec-repository-port`, `core:spec-metadata`, `default:_global/architecture`, `core:composition-resolver`
- `core:regenerate-spec-metadata`: explicit one-spec and batch forced rebuild orchestration.
  - Depends on: `core:materialize-spec-metadata`, `core:list-workspaces`, `core:spec-metadata`, `core:composition-resolver`
- `core:initialize-persisted-spec-state`: explicit one-time adoption of one lock-less spec or a batch of lock-less specs into persisted semantic state using an indicated schema or the effective project default, deriving initial state from current artifacts rather than cache snapshots.
  - Depends on: `core:spec-repository-port`, `core:spec-lock`, `core:schema-format`, `core:get-active-schema`, `core:content-extraction`, `core:list-workspaces`, `core:spec-id-format`, `core:composition-resolver`, `core:generate-metadata`
- `core:get-persisted-spec-schema`: reads the schema identity assigned by persisted spec state.
  - Depends on: `core:spec-repository-port`, `core:spec-id-format`
- `core:update-persisted-spec-schema`: explicitly reassigns an initialized spec to a compatible resolved schema without conflating migration with initialization.
  - Depends on: `core:spec-repository-port`, `core:spec-lock`, `core:schema-format`, `core:get-active-schema`, `core:content-extraction`, `core:spec-optimization`, `core:spec-id-format`, `core:composition-resolver`
- `core:get-persisted-spec-deps`: reads canonical dependencies from persisted spec state.
  - Depends on: `core:spec-repository-port`, `core:spec-id-format`
- `core:update-persisted-spec-deps`: applies list/add/remove/set/clear dependency mutations through the shared semantic patch helper and a conditional complete-state write.
  - Depends on: `core:spec-repository-port`, `core:spec-id-format`, `core:update-spec-deps`, `core:initialize-persisted-spec-state`
- `core:get-persisted-spec-implementation`: reads canonical implementation links.
  - Depends on: `core:spec-repository-port`, `core:spec-id-format`
- `core:update-persisted-spec-implementation`: adds, enriches, or removes canonical implementation links with change-tracking-equivalent validation.
  - Depends on: `core:spec-repository-port`, `core:spec-id-format`, `core:update-implementation-tracking`, `core:storage`, `core:workspace`, `core:initialize-persisted-spec-state`
- `core:get-persisted-spec-optimizations`: returns persisted optimized fields with per-field and aggregate freshness.
  - Depends on: `core:spec-optimization`, `core:spec-repository-port`, `core:spec-id-format`
- `core:update-persisted-spec-optimizations`: sets or clears selected optimized fields and captures a baseline only for fields changed by the operation.
  - Depends on: `core:spec-optimization`, `core:spec-repository-port`, `core:spec-id-format`, `core:initialize-persisted-spec-state`
- `core:get-spec-metadata`: normal self-healing metadata query and diagnostic result.
  - Depends on: `core:materialize-spec-metadata`, `core:spec-metadata`, `core:spec-id-format`
- `cli:spec-deps`: sectioned commands for canonical persisted dependencies.
  - Depends on: `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`, `cli:entrypoint`
- `cli:spec-implementation`: canonical-spec counterpart of `changes implementation`.
  - Depends on: `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`, `cli:entrypoint`
- `cli:spec-optimizations`: inspection and mutation of lock-owned optimized fields.
  - Depends on: `core:get-persisted-spec-optimizations`, `core:update-persisted-spec-optimizations`, `cli:entrypoint`
- `cli:spec-init`: explicit one-spec and batch persisted-state initialization for existing or externally adopted specs.
  - Depends on: `core:initialize-persisted-spec-state`, `cli:entrypoint`
- `cli:spec-schema`: inspection and explicit reassignment of the schema persisted for an initialized spec.
  - Depends on: `core:get-persisted-spec-schema`, `core:update-persisted-spec-schema`, `cli:entrypoint`

### Modified specs

- `core:spec-lock`: add optional, backward-compatible per-field optimization records and artifact/schema baselines, plus explicit initialization/adoption semantics for lock-less specs and guarded schema reassignment for initialized specs.
  - Depends on (added): none
  - Depends on (removed): none
- `core:spec-repository-port`: expose an aggregate persisted-state snapshot, conditional complete-state writes, complete persisted state in atomic publication, `artifactMeta()`, and storage-only metadata reads/writes without repository-owned freshness policy.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-spec-repository`: implement aggregate lock operations and metadata persistence while reusing existing hashing, stat, conflict, atomic-write, index, canonical lock serialization, and staged-publication helpers; remove `unknown/0` lock defaults.
  - Depends on (added): `core:spec-lock`, `core:spec-metadata`, `core:spec-optimization`
  - Depends on (removed): none
- `core:spec-metadata`: record source provenance, lock hash, and projection version; accept legacy documents without preserving metadata authority.
  - Depends on (added): `core:spec-lock`, `core:spec-optimization`
  - Depends on (removed): none
- `core:generate-metadata`: project one consistent lock snapshot, or explicit lock absence, include only fresh lock-owned optimizations, derive lock-less dependencies from current artifacts, and return the exact source fingerprint without persisting.
  - Depends on (added): `core:spec-optimization`
  - Depends on (removed): none
- `core:save-spec-metadata`: remove the obsolete use case after its internal responsibility moves to `PersistSpecMetadata`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:update-spec-metadata`: remove the obsolete metadata-owned optimization use case.
  - Depends on (added): none
  - Depends on (removed): `core:save-spec-metadata`
- `core:invalidate-spec-metadata`: remove explicit invalidation; freshness is derived from source fingerprints.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-specs`: materialize metadata before validating its normalized projection, while continuing to fail independently for stale persisted optimizations.
  - Depends on (added): `core:spec-lock`, `core:spec-repository-port`, `core:spec-optimization`, `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:archive-change`: build the complete persisted state through the shared semantic patch helper, preserve optimization records during publication, guard the observed lock revision, and force materialize metadata after canonical artifacts and lock are committed.
  - Depends on (added): `core:regenerate-spec-metadata`, `core:spec-optimization`, `core:initialize-persisted-spec-state`
  - Depends on (removed): none
- `core:compile-context`: obtain usable metadata through materialization before consuming normalized or optimized content.
  - Depends on (added): `core:materialize-spec-metadata`, `core:spec-optimization`, `core:project-metadata`
  - Depends on (removed): malformed `core:core/project-metadata`
- `core:get-spec-context`: use self-healing metadata and expose stale/missing optimization diagnostics.
  - Depends on (added): `core:materialize-spec-metadata`, `core:spec-optimization`
  - Depends on (removed): none
- `core:get-project-context`: self-heal required spec metadata during project-wide compilation and correct its project-metadata dependency.
  - Depends on (added): `core:project-metadata`, `core:materialize-spec-metadata`, `core:spec-optimization`
  - Depends on (removed): malformed `core:core/project-metadata`
- `core:list-specs`: materialize metadata needed for normalized titles/summaries, remove public metadata-status projection/filtering, and never expose a stale optimized summary.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:search-specs`: obtain normalized result fields through metadata materialization instead of reading a repository snapshot directly.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:project-metadata`: derive spec inputs from semantic metadata fingerprints rather than cache files or repository revisions.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:update-project-metadata`: materialize required spec metadata and persist semantic metadata fingerprints when refreshing project context.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:config-writer-port`: initialize the default metadata cache directory and root ignore entry idempotently.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: expose every public use case introduced or retained by this change under `Kernel.specs`, including deterministic generation, materialization, self-healing/forced metadata reads, persisted-state initialization, schema inspection/reassignment, and persisted queries/mutations, while removing public metadata save, update, and invalidate operations.
  - Depends on (added): `core:generate-metadata`, `core:initialize-persisted-spec-state`, `core:get-persisted-spec-schema`, `core:update-persisted-spec-schema`, `core:materialize-spec-metadata`, `core:regenerate-spec-metadata`, `core:get-spec-metadata`, persisted deps/implementation/optimization query and mutation specs
  - Depends on (removed): `core:save-spec-metadata`, `core:invalidate-spec-metadata`
- `core:kernel-builder`: guarantee that `build()` returns the complete revised Kernel surface for every registry/repository override combination; it does not maintain a second use-case list separate from `createKernel()`.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `core:composition`: provide the standard `*Deps`, `resolve*Deps`, and overloaded `create*` factories for every new public use case and stop exporting obsolete external metadata mutation factories.
  - Depends on (added): `core:materialize-spec-metadata`
  - Depends on (removed): none
- `sdk:composition`: re-export the revised Kernel, public use-case classes and contracts, and their `create*` factories without restoring removed metadata mutation APIs.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-init`: expose the Core-owned initialization result in which the generated metadata cache is ignored from creation.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-update-metadata`: remove the obsolete command.
  - Depends on (added): none
  - Depends on (removed): `core:update-spec-metadata`
- `cli:spec-write-metadata`: remove arbitrary metadata injection.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-invalidate-metadata`: remove manual invalidation.
  - Depends on (added): none
  - Depends on (removed): `core:invalidate-spec-metadata`
- `cli:spec-generate-metadata`: become the explicit forced rebuild command, remove metadata-status selection, and delegate one-spec and unfiltered batch work to `RegenerateSpecMetadata`.
  - Depends on (added): `core:regenerate-spec-metadata`
  - Depends on (removed): `core:generate-metadata`, `core:list-specs`
- `cli:spec-metadata`: return a self-healed projection plus source and optimization diagnostics through `GetSpecMetadata`.
  - Depends on (added): `core:get-spec-metadata`
  - Depends on (removed): none
- `cli:spec-list`: use Core materialization, remove `--metadata-status`, and never implement cache freshness or regeneration in the CLI.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:agents`: replace metadata editors with persisted optimization commands, remove the requirement to invoke metadata generation afterwards, and prohibit optimization work unless effective `llmOptimizedContext` is `true`.
  - Depends on (added): `cli:spec-optimizations`
  - Depends on (removed): `cli:spec-generate-metadata`
- `skills:skill-templates-source`: remove metadata-status scans and manual routine regeneration from archive and metadata-oriented workflow templates; normal consumers self-heal and both optimizer agents are gated by effective `llmOptimizedContext === true`.
  - Depends on (added): `cli:spec-optimizations`
  - Depends on (removed): none
- `code-graph:indexer`: materialize canonical spec metadata through Core and use its semantic fingerprint for incremental spec indexing instead of reading raw metadata snapshots.
  - Depends on (added): `core:get-spec-metadata`
  - Depends on (removed): none

## Impact

The change affects the lock schema, repository port and filesystem adapter, metadata schema and materialization policy, archive publication, validation, context compilation, listing/index summaries, Core/SDK composition, project initialization, CLI commands, and optimizer-agent templates.

`SpecRepository`, `Spec`, `SpecArtifact`, `GenerateSpecMetadata`, `ArchiveChange`, and kernel composition are high-coupling areas. Tests must cover filesystem and database-capable repository contracts, old locks, deleted or malformed caches, artifact and lock drift, concurrent materializers, read-only source workspaces, archive rollback, batch rebuilding, one-time initialization from lock-less artifacts, schemas whose artifacts cannot express dependencies, schema reassignment, direct-dependency and config-bootstrap factory parity, complete Kernel/KernelBuilder exposure, SDK exports, Git hygiene, and removal of public editors.

Scope overlaps remain intentional and require merged-delta coordination with
`implementation-snapshot` (`core:composition`), `deprecate-ladybug-store`
(`sdk:composition`), `remove-legacy-metadata-skill` (`skills:agents` and
`skills:skill-templates-source`), and both `code-graph-symbol-semantic-context` and
`graph-staleness-dirty-fingerprint` (`code-graph:indexer`).

### Documentation updates

The implementation must update the following existing documentation:

- `docs/guide/_sections/getting-started/spec-metadata.md`: explain that `spec-lock.json` owns persisted dependencies, implementation links, and LLM optimizations; metadata is a generated normalized cache that self-heals on ordinary reads.
- `docs/guide/_sections/getting-started/project-structure.md`: label `.specd/metadata/` as disposable generated cache state and document that new projects ignore it.
- `docs/guide/configuration.md` and `docs/config/config-reference.md`: state that `llmOptimizedContext` gates optimizer-agent writes, optimizations persist in `spec-lock`, and deterministic metadata materialization remains enabled when the flag is `false`.
- `docs/config/examples/approvals-and-workflow-hooks.md`: replace the claim that LLM processing generates metadata fields directly with the lock-owned optimization and generated-projection model.
- `docs/config/examples/single-repo-minimal.md`: include the metadata-cache directory and root ignore behaviour created by `project init`.
- `docs/guide/workflow.md`: describe archive ordering, lazy self-healing after source changes, and forced post-archive materialization without presenting manual generation as a prerequisite.
- `docs/schemas/schema-format.md`: describe `metadataExtraction` as an input to deterministic materialization, not as a consumer fallback that bypasses missing or stale metadata.
- `docs/cli/cli-reference.md`: add `specs init` and the `specs schema`, `specs deps`, `specs implementation`, and `specs optimizations` families; remove `update-metadata`, `write-metadata`, and `invalidate-metadata`; document `generate-metadata` as forced rebuilding and `specs metadata` as a self-healing read.
- `docs/cli/project-init.md`: document creation and idempotent ignoring of the default `.specd/metadata/` cache.
- `docs/core/ports.md`: document `readPersistedState`, `writePersistedState`, complete persisted state in `SpecPublication`, `artifactMeta`, `readMetadataSnapshot`, `writeMetadataSnapshot`, and storage-neutral revisions.
- `docs/core/use-cases.md`: add persisted-state initialization from current artifact projection, schema query/reassignment, state query/mutation, materialization, metadata query, and forced-regeneration use cases; document their common input/result/`execute` convention; classify guarded metadata persistence as an internal service; remove `SaveSpecMetadata`, `UpdateSpecMetadata`, and `InvalidateSpecMetadata` from the public model.
- `docs/core/services.md` and `docs/core/overview.md`: update metadata parsing/provenance, lock-owned optimization freshness, and the replacement of direct metadata saves.
- `docs/core/errors.md`: replace save/update examples and document source-conflict, metadata-revision, malformed-cache, and persisted-state failures exposed by the new workflows.
- `docs/core/config-writer.md`: document the filesystem cache directory and `.gitignore` initialization contract.
- `docs/core/sdk.md` and `docs/sdk/index.md`: enumerate the revised `kernel.specs` surface and `create*` factories, show hosts obtaining usable metadata through `kernel.specs.getMetadata`, keep `regenerateMetadata` for explicit forced rebuilding, and prohibit direct repository freshness logic.

The CLI documentation must add dedicated pages:

- `docs/cli/spec-init.md`
- `docs/cli/spec-schema.md`
- `docs/cli/spec-deps.md`
- `docs/cli/spec-implementation.md`
- `docs/cli/spec-optimizations.md`
- `docs/cli/spec-metadata.md`
- `docs/cli/spec-generate-metadata.md`

`docs/cli/spec-update-metadata.md` must be removed rather than retained as obsolete guidance. There are no compatibility aliases to document for the removed command.

Agent-facing templates are updated as implementation artifacts rather than user
documentation. Both
`packages/skills/templates/agents/specd-spec-context-optimizer/SPECD-AGENT.md.tpl`
and
`packages/skills/templates/agents/specd-project-context-optimizer/SPECD-AGENT.md.tpl`
must perform no optimization work unless effective
`llmOptimizedContext === true`; the spec optimizer uses `specs optimizations` and
neither agent invokes spec metadata generation afterwards. Archive, commit, and
metadata-oriented workflow templates must drop metadata-status scans and routine
manual generation. Generated agent distributions are refreshed through the
repository's normal agent-sync workflow rather than edited independently.

## Technical context

### Ownership and dependency direction

Metadata is a canonical normalized read model but not authoritative state. Ownership is divided by responsibility:

```text
SpecRepository
  ├── persists artifacts, spec-lock, and metadata
  ├── exposes physical artifact metadata
  └── does not generate or classify metadata freshness

MaterializeSpecMetadata
  ├── depends on SpecRepository
  ├── depends on GenerateSpecMetadata
  ├── depends on PersistSpecMetadata
  └── decides reuse versus regeneration
```

`FsSpecRepository` may use `.specd/metadata`; `DbSpecRepository` may use database storage. Neither adapter depends on an application use case or schema extractor. Generation and freshness dependencies point from application services toward repository ports, never from repository implementations toward application services.

Normal use cases depend on `MaterializeSpecMetadata` or `GetSpecMetadata`. `SpecRepository.readMetadataSnapshot()` is reserved for materialization and diagnostics that intentionally inspect persisted cache state.

### Core use-case and composition contract

New public Core operations use the same shape as existing use cases such as
`GetSpecContext`:

```ts
export interface XInput {
  // readonly application values
}

export interface XResult {
  // readonly application result
}

export class X {
  constructor(/* explicit ports and collaborating use cases */) {}

  async execute(input: XInput): Promise<XResult> {
    // application orchestration
  }
}
```

An operation with no meaningful input may use `execute(): Promise<XResult>`;
otherwise new use cases accept one typed input object rather than positional
application arguments. Domain/application failures remain typed exceptions. Core
inputs and results do not contain CLI flags, formatter values, filesystem-only
paths, or process exit semantics.

Each public use case also has a composition module following the current overload
pattern:

```ts
export interface XDeps {
  // explicit ports and collaborating use cases
}

export function resolveXDeps(resolver: CompositionResolver): XDeps
export function createX(deps: XDeps): X
export function createX(config: SpecdConfig, options?: CompositionResolutionOptions): X
```

Factories normalize the two public construction forms with
`normalizeCompositionFactoryArgs`; config bootstrap creates one
`CompositionResolver`, while Kernel wiring calls `resolveXDeps()` against its shared
resolver so repositories, schema registries, parsers, hashers, and transforms are not
rebuilt per use case. The use-case class, `Input`, `Result`, `Deps`, and `create*`
factory are exported through the Core public surface and re-exported by the SDK.

`Kernel.specs` exposes the public surface explicitly:

```ts
interface KernelSpecUseCases {
  readonly generateMetadata: GenerateSpecMetadata
  readonly materializeMetadata: MaterializeSpecMetadata
  readonly getMetadata: GetSpecMetadata
  readonly regenerateMetadata: RegenerateSpecMetadata
  readonly initializePersistedState: InitializePersistedSpecState
  readonly getPersistedDeps: GetPersistedSpecDeps
  readonly updatePersistedDeps: UpdatePersistedSpecDeps
  readonly getPersistedImplementation: GetPersistedSpecImplementation
  readonly updatePersistedImplementation: UpdatePersistedSpecImplementation
  readonly getPersistedOptimizations: GetPersistedSpecOptimizations
  readonly updatePersistedOptimizations: UpdatePersistedSpecOptimizations
  readonly getPersistedSchema: GetPersistedSpecSchema
  readonly updatePersistedSchema: UpdatePersistedSpecSchema
}
```

`createKernel()` constructs this set through the shared resolver.
`KernelBuilder.build()` delegates to `createKernel()` and must expose the identical
surface when custom registries or repository overrides are installed. CLI commands
receive the relevant Kernel use case and only parse input, invoke `execute()`, format
the result, and map typed failures.

`PersistSpecMetadata` is different by design: arbitrary metadata persistence is no
longer an application operation. It is an internal service used by
`MaterializeSpecMetadata`, accepts only a complete generated projection plus observed
revision, and is not exposed on Kernel, Core public exports, SDK, CLI, or MCP. Keeping
this distinction prevents the internal guarded writer from becoming the replacement
for the removed `write-metadata` command.

### Persisted optimization state

The lock adds an optional optimization block:

```ts
interface PersistedArtifactStateEntry {
  readonly hash: string
  readonly lastModified: string
}

type PersistedArtifactState = Readonly<Record<string, PersistedArtifactStateEntry>>

interface PersistedOptimizationField {
  readonly value: string
  readonly schema: PersistedSchemaIdentity
  readonly artifactState: PersistedArtifactState
}

interface PersistedSpecOptimizations {
  readonly optimizedDescription?: PersistedOptimizationField
  readonly optimizedContext?: PersistedOptimizationField
}
```

Each field owns an independent artifact and schema baseline. Updating one field does not refresh the other. Clearing the last field removes `optimizations`. A schema reassignment makes an existing optimization stale even when the artifact bytes are unchanged. Old locks without the optional block remain valid and no migration copies optimization values from metadata into the lock.

The baseline contains every present schema-declared `scope: spec` artifact, sorted by filename. It excludes `metadata.json`, `spec-lock.json`, change artifacts, absent optional artifacts, and unrelated files. Raw UTF-8 SHA-256 is the semantic identity. Equal hashes with different `lastModified` values produce diagnostics but do not make an optimization stale.

### Persisted-state construction and repository contracts

The physical `spec-lock.json` document belongs to the filesystem adapter, but the
state it represents and the rules for constructing it are storage-neutral. Core
therefore separates semantic state construction from adapter persistence:

```text
application use case / ArchiveChange
  └── applyPersistedSpecStatePatch()
        └── complete PersistedSpecState
              ├── SpecRepository.writePersistedState()
              └── SpecRepository.publish({ persistedState })

FsSpecRepository
  └── canonical serialize + conditional atomic/staged write

DbSpecRepository
  └── conditional row/document write
```

The shared pure helper accepts either an existing snapshot or an explicit initial
base. It never reads artifacts, metadata, repositories, or filesystem paths:

```ts
type PersistedSpecStateBase =
  | {
      readonly kind: 'existing'
      readonly state: PersistedSpecStateSnapshot
    }
  | {
      readonly kind: 'initial'
      readonly schema: PersistedSchemaIdentity
      readonly dependsOn: readonly string[]
    }

applyPersistedSpecStatePatch(
  base: PersistedSpecStateBase,
  patch: PersistedSpecStatePatch,
): PersistedSpecState
```

For an initial base, it creates required `schema` and `dependsOn`, defaults
`implementation` to `[]`, omits `optimizations`, then applies the requested patch.
For an existing base, it preserves omitted fields and rejects schema replacement.
It reuses the dependency and implementation-link normalizers, sorts optimization
artifact baselines, and removes an empty `optimizations` block. It never emits the
current filesystem fallback `{ schema: { name: 'unknown', version: 0 } }`.

The application layer has one `resolveInitialPersistedDependsOn()` service shared by
every path that can create the first persisted state: explicit initialization,
incidental creation by a mutation use case, and `ArchiveChange`. It loads the exact
schema-declared canonical artifact set that will be authoritative, verifies that it
parses under the selected schema, and reuses the deterministic projection logic behind
`GenerateSpecMetadata` and `extractMetadataFromSpecArtifacts`. It never reads a
persisted metadata snapshot.

For a missing lock, initial dependency resolution is:

1. a complete value explicitly supplied by `deps set`, `deps clear`, or the archive
   publication plan wins;
2. otherwise use `dependsOn` from the fresh deterministic projection of the current
   canonical artifacts under the selected schema;
3. when the schema cannot extract dependencies from those artifacts, use `[]`.

For a legacy spec without a lock, artifacts are the authority. Persisted metadata is
only a cache of their normalized projection: missing, invalid, stale, or
legacy-provenance metadata is regenerable and cannot contribute independent values to
the new lock. A normal `GetSpecMetadata` read may reuse a fresh cache or self-heal any
other cache state, but freshness only proves that the returned value is derived from
the current artifacts and projection contract; it does not make metadata a source of
truth.

Initialization does not need to persist that intermediate pre-lock cache. It invokes
the same non-writing deterministic generation/projection logic directly and uses the
returned `dependsOn`. This avoids a cache write that would become stale immediately:
before initialization metadata records `persistedStateHash: null`; after the lock is
written, the lock hash changes the source fingerprint and the next normal metadata
consumer rematerializes the post-lock projection.

For example, initializing `core:actor-resolver-null` retains
`core:actor-provider` because the selected schema extracts that dependency from its
current artifact. The existing metadata may contain the same value, but it is not the
reason the value is persisted.

If a selected schema stores dependencies only in `spec-lock` and the imported,
lock-less artifacts contain none, there is no recoverable dependency source.
Initialization uses `[]`; callers that know external dependencies must persist them
explicitly through `specs deps set` rather than importing them from an unverifiable
cache snapshot.

The lock remains hidden behind one semantic snapshot and conditional complete-state
write:

```ts
interface PersistedSpecStateSnapshot {
  readonly schema: PersistedSchemaIdentity
  readonly dependsOn: readonly string[]
  readonly implementation: readonly PersistedImplementationLink[]
  readonly optimizations?: PersistedSpecOptimizations
  readonly originalHash: string
}

readPersistedState(
  spec: Spec,
): Promise<PersistedSpecStateSnapshot | null>

writePersistedState(
  spec: Spec,
  state: PersistedSpecState,
  options: { expectedRevision: string | null },
): Promise<PersistedSpecStateSnapshot>

persistedStateHash(spec: Spec): Promise<string | null>
```

`expectedRevision: null` means that persisted state must still be absent and closes
the creation race. Absence is compared as its own state, not as the hash of an empty
document. A present revision must still match the observed snapshot. The repository
performs one conditional atomic replacement, refreshes indexes once, enforces
read-only source ownership, and returns the newly persisted snapshot. Canonical
mutation conflicts fail with a typed error rather than silently rebasing a user's
operation onto a concurrent winner.

Application use cases apply list/add/remove/set/clear or link/optimization semantics,
call `applyPersistedSpecStatePatch()`, and pass the complete result to the repository.
This keeps merge and invariant logic out of filesystem and future database adapters.

Operations that are semantic no-ops do not create authoritative state:

- `deps set`, `deps clear`, non-empty `deps add`, `implementation add`, and
  `optimizations set` create missing persisted state;
- `deps remove`, `implementation remove`, and `optimizations clear` against a
  missing lock are no-ops and do not create one.

### Explicit persisted-state initialization and external adoption

Incidental creation during archive or a mutating command is insufficient for imported
repositories and future projects in which different specs may use different schemas.
Core therefore exposes `InitializePersistedSpecState` as an explicit adoption
operation:

```ts
interface InitializePersistedSpecStateInput {
  readonly target:
    | { readonly kind: 'spec'; readonly specId: string }
    | { readonly kind: 'all'; readonly workspaces?: readonly string[] }
  readonly schemaRef?: string
}
```

`schemaRef` selects a resolvable schema explicitly. When omitted, Core uses the
effective project schema. One invocation assigns one resolved schema; repositories
that need different schemas run targeted initialization separately. This change
persists a forward-compatible per-spec schema identity but does not itself make every
consumer resolve a different schema per spec; full heterogeneous-schema resolution is
a future capability.

For each target, the use case:

1. resolves the schema once through Core composition;
2. discovers raw spec identities without materializing metadata;
3. reads the aggregate persisted-state snapshot;
4. rejects any existing state with `SpecAlreadyInitializedError`, regardless of
   whether its schema identity matches;
5. loads the schema-declared canonical artifacts and verifies that they can be parsed
   under the selected schema;
6. resolves initial dependencies through `resolveInitialPersistedDependsOn()`;
7. calls `applyPersistedSpecStatePatch()` with an initial base and an empty patch;
8. conditionally writes with `expectedRevision: null`.

Initialization imports no dependency, optimization, or implementation data from
persisted metadata. It creates `implementation: []`, omits `optimizations`, derives
`dependsOn` from the current artifact projection, and does not materialize metadata
eagerly. The next normal consumer self-heals any cache made stale by creation of the
lock.

Initialization is a one-time operation and has no `--force` or schema-reassignment
path. A single-spec request against any existing lock fails with
`SpecAlreadyInitializedError`. Batch mode first selects only lock-less specs, then
continues across eligible targets and returns per-spec `initialized`/`failed` results
plus an `existingSkipped` count; it does not pretend to initialize existing locks.
A failure in any eligible entry produces a failing overall outcome. Read-only
workspaces report failures rather than being silently skipped.

The CLI maps this use case directly:

```text
specs init <spec-id> [--schema <schema-ref>]
specs init --all [--workspace <name>...] [--schema <schema-ref>]
```

`specs init` initializes persisted semantic state for artifacts that already exist; it
does not create spec artifacts. This makes adoption explicit for repositories using a
compatible external format such as OpenSpec: configure or select the compatible schema,
then initialize the imported specs under that schema.

### Persisted schema inspection and reassignment

Changing the schema of an initialized spec is deliberately separate from
initialization. Core exposes `GetPersistedSpecSchema` and
`UpdatePersistedSpecSchema`; the CLI maps them directly:

```text
specs schema get <spec-id>
specs schema set <spec-id> --schema <schema-ref>
```

`schema get` requires an initialized spec and returns its persisted schema identity.
`schema set` also requires an existing lock; it never creates one. The update use case
resolves the target schema, loads and parses its declared artifacts under that schema,
and extracts dependencies when the target schema defines dependency extraction.

The existing lock remains canonical during reassignment. If the target schema does
not extract dependencies, the use case preserves current lock dependencies. If it
does extract them, the extracted value must equal the current canonical dependencies
or the operation fails with `PersistedSchemaDependencyConflictError`; users change
dependencies explicitly through `specs deps` rather than as a side effect of schema
selection. Implementation links and optimization values/baselines are preserved.
Because each optimization baseline records its schema identity, reassignment makes
those optimizations stale until explicitly refreshed.

The generic `applyPersistedSpecStatePatch()` continues to reject schema replacement.
Only `UpdatePersistedSpecSchema` may construct a complete state with a different
schema after the compatibility checks above, and it conditionally writes against the
observed revision. Selecting the already-persisted schema is a semantic no-op. This
operation rebinds compatible existing artifacts; transformation between incompatible
artifact formats remains a separate future migration capability.

`SpecPublication` carries the same complete `PersistedSpecState` plus the expected
persisted-state revision. `ArchiveChange` reads one aggregate snapshot and computes
the final artifacts. If the lock is missing, it invokes the same
`resolveInitialPersistedDependsOn()` service, passing the complete dependency value
from the archive publication plan when one exists; it does not maintain a second
artifact/metadata fallback algorithm. It then applies the shared pure patch helper and
gives the complete result to `publish()`. It does not call
`writePersistedState()` separately, because artifacts and lock must remain one staged
per-spec publication. The revision guard prevents archive from overwriting
dependencies, links, or optimizations changed concurrently after preflight.

`FsSpecRepository` has one canonical serializer/writer shared internally by
`writePersistedState()` and staged `publish()`. It validates a complete state, emits
stable JSON, uses the existing atomic writer, and hashes the exact bytes. It does not
choose schema identity, extract dependencies, apply patches, or invent defaults. A
future database adapter persists the same complete semantic value using its own
transaction and revision mechanism.

The repository also exposes:

```ts
interface ArtifactMeta {
  readonly hash: string
  readonly lastModified: string
}

artifactMeta(
  spec: Spec,
  filename: string,
): Promise<ArtifactMeta | null>
```

Filesystem code must reuse the existing artifact stat/hash path used to populate `SpecArtifact.originalHash` and `Spec.artifacts[].lastModified`; `artifactMeta()` is not a second hashing implementation. A database adapter may answer from stored columns without loading artifact content.

Metadata persistence remains part of the repository. Its concurrency token is named `revision`, rather than `originalHash`, because the port must not require every adapter to version a metadata record through raw file bytes:

```ts
type MetadataSnapshot =
  | {
      readonly kind: 'missing'
      readonly revision: null
    }
  | {
      readonly kind: 'invalid'
      readonly revision: string
      readonly error: SpecMetadataParseError
    }
  | {
      readonly kind: 'present'
      readonly metadata: SpecMetadata
      readonly revision: string
    }

readMetadataSnapshot(
  spec: Spec,
): Promise<MetadataSnapshot>

writeMetadataSnapshot(
  spec: Spec,
  metadata: SpecMetadata,
  options: { expectedRevision: string | null },
): Promise<MetadataSnapshot>
```

`present`, `missing`, and `invalid` are persistence/parse kinds, not freshness states. The repository cannot know `fresh` versus `stale` because it does not own generator inputs or policy.

`writeMetadataSnapshot()` writes the complete projection and never patches or merges individual fields. `expectedRevision: null` means the metadata must still be absent. The returned value is the newly persisted snapshot and revision.

`FsSpecRepository` serializes stable canonical JSON and may use the resulting raw-byte SHA-256 as its revision. `DbSpecRepository` may store structured JSON or columns and use a row version, transaction revision, or ETag. Serialization is therefore an adapter concern; the application port accepts `SpecMetadata`, not a pre-serialized JSON string.

Canonical source ownership and cache ownership are distinct. A `readOnly` workspace still forbids artifact and lock mutation, but may persist its generated metadata in the project-local cache. The filesystem adapter must therefore stop applying the authored-source ownership guard to metadata cache writes.

### Freshness and provenance

Generated metadata records:

```ts
interface SpecMetadataProvenance {
  readonly artifacts: Readonly<
    Record<
      string,
      {
        readonly hash: string
        readonly lastModified: string
      }
    >
  >
  readonly persistedStateHash: string | null
  readonly schema: PersistedSchemaIdentity
  readonly projectionVersion: number
  readonly projectionFingerprint: string
}
```

`lastModified` remains diagnostic. Semantic freshness compares the exact artifact
filename set and hashes, the raw persisted-state hash including lock absence, schema
identity, metadata projection version, and `projectionFingerprint`. The projection
fingerprint covers the effective `metadataExtraction` configuration, registered
extractor transforms, schema extends/plugins/overrides that affect extraction, and
generator algorithm version. It is a hash of the resolved projection contract, not a
copy of the resolved schema.

Freshness is a pure application/domain comparison:

```ts
assessMetadataFreshness(
  persisted: SpecMetadata,
  current: SpecMetadataSourceState,
): MetadataFreshnessAssessment
```

The repository supplies stored metadata and current physical state through its ports but does not return `fresh` or `stale`. Explicit invalidation is unnecessary and insufficient because editors, Git, another process, or a database client can change source state without passing through the current process.

Optimization freshness remains independent:

- artifact only in current state: `artifact-added`;
- artifact only in the baseline: `artifact-removed`;
- unequal hashes: `artifact-changed`;
- equal hashes with unequal `lastModified`: diagnostic only;
- absent optional field: `missing`, not a validation error.

### Materialization

`MaterializeSpecMetadata` is the single shared orchestration:

```ts
interface MaterializeSpecMetadataInput {
  readonly specId: string
  readonly policy?: 'if-needed' | 'force'
}

interface MaterializeSpecMetadataResult {
  readonly metadata: SpecMetadata
  readonly metadataFingerprint: string
  readonly source: 'persisted' | 'generated'
  readonly regenerated: boolean
  readonly warnings: readonly SpecMetadataGenerationWarning[]
}
```

For `if-needed`, it:

1. resolves the workspace and spec;
2. reads persisted metadata once;
3. reads current artifact metadata and one lock snapshot;
4. returns a structurally valid, fresh projection unchanged;
5. otherwise generates metadata from a consistent loaded artifact set and that lock snapshot;
6. re-reads the source fingerprint immediately before saving;
7. refuses to persist if artifacts, schema identity, projection version, or lock changed;
8. delegates strict validation to `PersistSpecMetadata` and atomically writes with the observed metadata `revision`;
9. returns the generated in-memory projection.

For a metadata-file conflict, it re-reads the winner. If the winner is fresh it returns that value; otherwise it performs at most one bounded retry before returning a typed conflict. Source conflicts never write metadata.

`GenerateSpecMetadata` continues to load artifact content for extraction and returns the exact source state it used, including artifact hashes and the snapshot `originalHash`. The materializer reuses that result rather than re-reading and re-hashing content during the same generation attempt.

`PersistSpecMetadata` is an internal application collaborator. It validates the complete generated domain value and delegates conditional storage to `SpecRepository.writeMetadataSnapshot()`. It is not exposed by the Kernel, SDK, CLI, MCP, or other hosts.

`GetSpecMetadata` delegates with `policy: 'if-needed'`. `RegenerateSpecMetadata` delegates with `policy: 'force'`. This avoids duplicated generation, persistence, and concurrency logic.

Public metadata freshness statuses and status filters are removed. Missing, invalid,
and stale are internal materialization decisions; consumers receive usable metadata,
its semantic fingerprint, its source, whether regeneration occurred, and warnings.
`ListSpecs` no longer projects `metadataStatus`, and ordinary skills do not scan or
repair statuses manually.

Batch regeneration discovers raw spec identities through `ListWorkspaces` and
repository listing, not through `ListSpecs`: `ListSpecs` itself may materialize
metadata, so using it for forced selection would create a use-case cycle.

If generation succeeds but a normal cache write fails, materialization returns the
fresh in-memory metadata with a structured `metadata-cache-write-failed` warning and
emits one `Logger.warn` containing the spec identity and storage error diagnostics.
Callers propagate the warning without logging it again. Explicit forced regeneration
exists to persist the cache, so the same write failure is a failed one-spec result or
failed batch entry and produces a non-zero CLI outcome.

### Consumers and validation

Every normal consumer that requires normalized metadata uses materialization:

| Consumer                             | Behaviour                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `GetSpecMetadata` / `specs metadata` | returns a fresh projection and reports whether it was reused or generated                                             |
| `CompileContext`                     | materializes only specs included in the compiled context                                                              |
| `GetSpecContext`                     | materializes the requested spec and relevant dependencies                                                             |
| `GetProjectContext`                  | materializes metadata for specs whose normalized fields it consumes                                                   |
| `ListSpecs`                          | materializes entries whose title/summary requires metadata; repository listing remains a raw identity/index operation |
| `SearchSpecs`                        | materializes normalized result fields rather than reading a raw repository cache snapshot                             |
| `UpdateProjectMetadata`              | stores semantic per-spec metadata fingerprints as project-context inputs                                              |
| code graph indexer                   | materializes spec metadata and uses the semantic fingerprint for incremental re-indexing                              |
| `ValidateSpecs`                      | materializes before validating normalized metadata content                                                            |

Missing or stale metadata is not itself a validation failure when Core can regenerate it. Validation fails if materialization cannot produce valid metadata. Persisted optimization staleness remains an independent validation failure because Core cannot author a replacement optimization automatically.

Lock mutation use cases do not need to regenerate metadata eagerly and do not instruct users to run `generate-metadata`. They may leave the cache stale; the next metadata consumer repairs it. Archive forces materialization after committing canonical artifacts and lock so archive results continue to report cache-write failures explicitly.

### CLI contract

The canonical commands are:

```text
specs deps list <spec-id>
specs deps add <spec-id> --dep <dependency-id>...
specs deps remove <spec-id> --dep <dependency-id>...
specs deps set <spec-id> --dep <dependency-id>...
specs deps clear <spec-id>

specs implementation list <spec-id>
specs implementation add <spec-id> --file <path> [--symbol <name>...]
specs implementation remove <spec-id> --file <path> [--symbol <name>...]

specs optimizations get <spec-id> [--field optimizedDescription|optimizedContext]
specs optimizations set <spec-id> --input <json-file|->
specs optimizations clear <spec-id> --field optimizedDescription|optimizedContext...

specs init <spec-id> [--schema <schema-ref>]
specs init --all [--workspace <name>...] [--schema <schema-ref>]

specs schema get <spec-id>
specs schema set <spec-id> --schema <schema-ref>

specs metadata <spec-id>
specs generate-metadata <spec-id>
specs generate-metadata --all
```

`specs generate-metadata` always forces reconstruction and persistence; the old
`--write` distinction and `--status` selection are removed. `--all` deliberately
forces every discovered spec and remains useful for warming, repair, CI, and
diagnostics. Routine correctness comes from self-healing consumers.

`update-metadata`, `write-metadata`, and `invalidate-metadata` have no aliases or compatibility shims. Optimizer skills call `specs optimizations set` only; subsequent consumers self-heal metadata.

Before calling either the spec-context optimizer or project-context optimizer agent,
or `specs optimizations set`, skills and agent templates read the effective
configuration. They act only when `llmOptimizedContext === true`. With `false`, they
neither treat absent/stale optimized fields as an actionable warning nor write
optimization or metadata state. This feature gate controls authored LLM optimization;
it does not disable ordinary deterministic metadata materialization required by
schema-independent consumers, and it does not prohibit a human from explicitly
persisting an optimization for later use.

### Filesystem cache and project initialization

`FsConfigWriter.initProject()` must:

1. create the resolved metadata cache directory idempotently;
2. append `/.specd/metadata/` to the root `.gitignore` without duplicates;
3. preserve existing ignore content and the existing `.specd/tmp/.gitignore` contract.

The ignore entry is rooted so similarly named nested directories are unaffected. A configured non-filesystem repository is not subject to this layout.

For existing projects, implementation and release notes must distinguish ignoring from untracking. The product does not silently mutate the Git index. This repository may remove its tracked generated metadata as an explicit migration in the implementation change.

When a user configures a custom filesystem `metadataPath`, keeping that path outside
version control is the user's responsibility. Configuration documentation must call
out that the path remains disposable generated cache state and should be ignored when
it is located inside a repository; runtime does not rewrite `.gitignore` for arbitrary
custom paths.

### Archive, compatibility, and failure semantics

`SpecPublication` carries the complete persisted state, not a list of known individual lock fields, so publishing cannot drop optimizations or future additions. Archive copies optimization values and baselines unchanged; changed artifacts make them stale naturally. It commits canonical artifacts and lock before forced metadata materialization.

Compatibility rules are:

- old locks without `optimizations` remain valid;
- no optimization is imported from legacy metadata;
- no dependency is imported from persisted metadata while creating the first lock;
- lock-less initialization derives dependencies from the current artifact projection,
  with `[]` when the selected schema cannot extract them;
- old metadata without current provenance is stale and self-healed on first use;
- metadata with agent-authored optimized fields but no matching lock state is regenerated without them;
- deleted metadata is a normal cache miss;
- malformed metadata is replaced through the guarded materialization path;
- lock-less legacy specs record explicit lock absence in new provenance;
- ordinary metadata reads and materialization never create or backfill authoritative
  persisted state;
- lock creation is limited to archive publication, explicit persisted-state mutation,
  and explicit `specs init` adoption;
- `specs init` never rewrites an existing lock; `specs schema set` is the explicit,
  guarded schema-reassignment path;
- `generatedBy: 'agent'` remains leniently readable only for migration and is never emitted.

Repository and use-case failures remain typed. Normal single-spec consumers receive a typed failure only when a valid in-memory projection cannot be produced or required source reads fail. Explicit forced generation additionally treats cache persistence failure as a command failure. Batch force rebuilding records per-spec failures and continues.

### Reuse and duplication boundaries

The implementation reuses:

- existing artifact hashing and stat helpers behind `artifact()` and `artifactMeta()`;
- `SpecArtifact.originalHash` when content is already loaded;
- `persistedStateHash` and lock `originalHash`;
- `specFingerprint` where the validation cache already needs whole-spec invalidation;
- existing atomic file/JSON writers and `ArtifactConflictError`;
- one artifact-authoritative `resolveInitialPersistedDependsOn()` service shared by
  explicit initialization, incidental first-state creation, and `ArchiveChange`;
- the shared pure `applyPersistedSpecStatePatch()` service from both persisted-state
  mutation use cases and `ArchiveChange`;
- one canonical FS lock serializer/writer from both `writePersistedState()` and
  staged `publish()`;
- `extractMetadataFromSpecArtifacts`;
- dependency normalization and mutation rules extracted from `UpdateSpecDeps`;
- implementation-link add/enrich/remove rules extracted from change tracking;
- existing archive batch snapshot/restore;
- `ListWorkspaces` and raw repository listing for force-batch selection.

Hashing, freshness comparison, artifact traversal, initial dependency derivation,
persisted-state initialization, schema compatibility checks, patch application,
serialization, optimistic concurrency, batch selection, and mutation rules must not
be reimplemented in CLI handlers, `ArchiveChange`, repository adapters, or
independently in each consumer.

## Addendum: cheap repository Meta and list stamps (2026-07-24)

After the lock/metadata materialization work was already designed and largely
implemented, discovery of a hot `ValidateSpecs --all` / workspace path showed a
remaining cost: `list()` then N×`get()` only to obtain stamp bundles for the
validation result-cache hard-hit check.

### Incremental problem

`FsSpecRepository.list()` already maintains a list index whose wire rows carry
per-file source stamps (`sourceFiles`) for index freshness, but those stamps are
never projected into `SpecListEntry`. Validate therefore pays a second full
`get()` (readdir + stats) per spec before it can look up the result cache.

Separately, the port requires `ArtifactMeta.hash` always and exposes
`persistedStateHash(spec)` as a dedicated method, even though callers that only
need a cheap observation want `lastModified`, and hash is the expensive opt-in.

### Incremental solution

Unify cheap physical observations under a `*Meta` family on `SpecRepository`:

- `ArtifactMeta` — `lastModified` required; `hash` only when `includeHash: true`
- `PersistedStateMeta` — same shape for persisted semantic state
- `GeneratedMetadataMeta` — same shape for the generated metadata cache (not the
  snapshot body)
- `artifactMeta(spec, filename, { includeHash? })`
- `persistedStateMeta(spec, { includeHash? })`
- `generatedMetadataMeta(spec, { includeHash? })`

Remove the `persistedStateHash(spec)` method. Callers migrate to
`persistedStateMeta(spec, { includeHash: true })?.hash ?? null`. The
**provenance field** named `persistedStateHash` inside generated metadata remains.

Extend `SpecListEntry` / `SpecListOptions`:

- `includeMeta?: boolean` — when true, project lastModified-only metas; list MUST
  NEVER compute or return `hash`
- `artifacts?: SpecListArtifactMeta[]` (`filename` + `lastModified`) for present
  schema artifacts only
- `persistedStateMeta?: PersistedStateMeta | null` — `null` means requested and
  absent; omit the field when `includeMeta` is false
- `generatedMetadataMeta?: GeneratedMetadataMeta | null` — same absence rule

FS list index: do **not** enrich the wire format. Project existing `sourceFiles`
into the public Meta shapes when `includeMeta` is set (same pattern as
`includeSummary` projection).

`ValidateSpecs` workspace/`--all` discovery MUST use
`list({ includeMeta: true })` and feed those stamps into the validation result
cache hard-hit path without N×`get()`. Soft-hit and miss still require content
I/O / full validation as today.

### Specs affected by this addendum

#### Modified specs

- `core:spec-repository-port`: Meta family; `includeMeta` / list entry shape;
  remove `persistedStateHash` method; optional `ArtifactMeta.hash`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-spec-repository`: project index `sourceFiles` into Meta; implement
  Meta methods; drop `persistedStateHash` method wrapper.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-specs`: discover via `list({ includeMeta: true })` for cache
  hard-hit; avoid N×`get()` on warm hard hits.
  - Depends on (added): none
  - Depends on (removed): none
- `core:generate-metadata`: obtain lock hash via `persistedStateMeta({ includeHash: true })`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validation-result-cache-port`: allow lookup stamp input derived from list
  Meta / Spec stamps equivalently (hard-hit without requiring a hydrated `Spec`
  from `get()` when stamps are already known).
  - Depends on (added): none
  - Depends on (removed): none

### Out of scope for this addendum

- `saveArtifact` reopen vs artifact-drift semantics (parked as draft
  `save-artifact-reopen-vs-drift`)
- Changing the validate soft-hit / content-fingerprint algorithm itself

## Open questions

None. Source ownership, repository persistence ownership, dependency direction, lock shape, freshness derivation, automatic materialization, forced generation, Git hygiene, CLI families, compatibility, archive ordering, and the Meta/list stamp contract are fixed by this proposal.
