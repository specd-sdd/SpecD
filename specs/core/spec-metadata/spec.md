# Spec Metadata

## Purpose

Tooling and AI agents need a compact, machine-readable summary of each spec — its dependencies, content hashes, rules, and scenarios — without parsing the full artifact files every time. Each spec has a corresponding `metadata.json` file stored under `.specd/metadata/<workspace>/<capability-path>/`, separate from the spec's content artifacts.

`metadata.json` is the canonical normalized consumer form of a persisted spec. It unifies heterogeneous schemas and companion-file layouts into one stable shape for consumers even when the underlying schema expresses the same information across different files, section names, or sidecars. It is generated deterministically by core at archive time using the schema's `metadataExtraction` engine together with repository semantic persisted state; content hashes and canonical projection checks enable staleness detection so consumers know when to regenerate.

## Requirements

### Requirement: File location and naming

`metadata.json` lives under the `.specd/metadata/` directory, organized by workspace then capability path:

```
.specd/metadata/core/config/
└── metadata.json

.specd/metadata/skills/get-skill/
└── metadata.json

.specd/metadata/plugin-manager/agent-plugin-type/
└── metadata.json
```

The path structure is: `.specd/metadata/<workspace>/<capability-path>/metadata.json`, where:

- `<workspace>` is the workspace name from `specd.yaml`
- `<capability-path>` is the spec's capability path (with prefix segments if workspace has a prefix)

The metadata root path is configured per workspace via `specs.fs.metadataPath` in `specd.yaml`. When not set, the composition layer auto-derives it from the VCS root of the workspace's specs path: `createVcsAdapter(specs.path).rootDir()` + `/.specd/metadata/`. This works across heterogeneous VCS setups (git, hg, svn). When `NullVcsAdapter` is returned (specs path is not inside any VCS), the fallback is `.specd/metadata/` relative to the specs root parent directory. The `FsSpecRepository` adapter receives the resolved path as config — it does not perform VCS detection itself.

The file's absence is not an error — a spec with no `metadata.json` is treated as having no declared dependencies and no recorded content hash.

### Requirement: Sidecar separation

The metadata generation process SHALL obtain persisted schema, dependencies, and implementation links through the `SpecRepository` semantic operations. It MUST NOT read the underlying sidecar files directly.

### Requirement: Spec.generatedMetadataStamp is a stamp only

`Spec.generatedMetadataStamp` returned by `SpecRepository.get()` MUST expose only
`{ present, lastModified }` for the generated `metadata.json` file. It MUST NOT be
treated as authored spec content and MUST NOT replace `metadata()`.

Parsed metadata content, structural validation, freshness classification
(`fresh` / `stale` via contentHashes and dependency projection), and overwrite
protection remain available only through `metadata()` / `saveMetadata()` and the
generation/save use cases defined by this spec and related ports.

### Requirement: File format

`metadata.json` is a JSON file (per ADR-0019: machine-generated files use JSON).
All fields are optional — an empty object or absent file is valid:

```json
{
  "title": "Change",
  "description": "The central domain entity in specd.",
  "dependsOn": ["core:storage", "core:delta-format"],
  "contentHashes": {
    "spec.md": "sha256:abc123..."
  },
  "rules": [{ "requirement": "Lifecycle states", "rules": ["..."] }],
  "constraints": ["..."],
  "scenarios": [{ "requirement": "...", "name": "...", "given": [], "when": [], "then": [] }],
  "optimizedDescription": "AI optimized description",
  "optimizedContext": "AI optimized context",
  "generatedBy": "core",
  "provenance": {
    "artifacts": {
      "spec.md": { "hash": "sha256:...", "lastModified": "2026-07-24T00:00:00.000Z" }
    },
    "persistedStateHash": null,
    "schema": { "name": "specd/std", "version": 1 },
    "projectionVersion": 1,
    "projectionFingerprint": "sha256:..."
  }
}
```

Fields:

- `title` — human-readable display title
- `description` — short summary of the spec's purpose
- `keywords` — lowercase hyphen-separated discovery tokens
- `dependsOn` — array of spec IDs this spec depends on; this is a normalized
  projection of the spec's persisted dependency state, not an independently
  authored value
- `contentHashes` — `{ filename: "sha256:<hex>" }` for staleness detection
- `rules` — extracted requirements grouped by heading
- `constraints` — extracted constraint bullets
- `scenarios` — extracted verification scenarios
- `context` — freeform context strings
- `optimizedDescription` — a normalized projection of `spec-lock.json`'s
  `optimizations.optimizedDescription.value`. It is included only when that
  field's persisted baseline is fresh against the current artifacts and schema
  identity; it MUST be omitted, not fabricated, when stale or absent.
- `optimizedContext` — the same projection of
  `optimizations.optimizedContext.value`, subject to the same freshness gate.
- `generatedBy` — always `"core"`; metadata content is always produced by
  deterministic generation. A legacy document with `generatedBy: "agent"` MAY
  still be read leniently for migration, but no generation path emits that
  value.
- `provenance` — the `SpecMetadataProvenance` record described in Requirement:
  Source provenance, used to determine whether this document is fresh relative
  to current source state

### Requirement: Source provenance

Generated metadata MUST record a `provenance` object describing the exact
source state it was produced from:

- `artifacts` — a record keyed by artifact filename, each entry containing the
  `hash` (content hash) and diagnostic `lastModified` stamp of that artifact at
  generation time
- `persistedStateHash` — the lock sidecar's `persistedStateHash` at generation
  time, or `null` when no persisted lock state exists for the spec
- `schema` — the `PersistedSchemaIdentity` (`{ name, version }`) in effect at
  generation time
- `projectionVersion` — the integer version of the metadata generation/
  projection contract used
- `projectionFingerprint` — a hash of the effective `metadataExtraction`
  configuration, registered extractor transforms, schema extends/plugins/
  overrides that affect extraction, and the generator algorithm version; it is
  a hash of the resolved projection contract, not a copy of the resolved schema

`lastModified` values recorded in `provenance.artifacts` are diagnostic only.
Freshness comparisons MUST use `hash`, `persistedStateHash`, `schema`,
`projectionVersion`, and `projectionFingerprint` — never `lastModified` alone.

`provenance` is the complete input to freshness comparison. `contentHashes`
remains present as a simpler consumer-facing convenience field but MUST be
derivable from `provenance.artifacts` and MUST NOT diverge from it.

### Requirement: Structural validation before persistence

The internal metadata-persistence guard (`PersistSpecMetadata`) validates
generated JSON content against the `strictSpecMetadataSchema` Zod schema before
writing. The content must be a JSON object. `title` and `description` are
required; other fields are optional but when present must conform to their
declared types and formats:

- `title` (required) must be a non-empty string
- `description` (required) must be a non-empty string
- `keywords` must be an array of non-empty lowercase strings
- `dependsOn` must be an array of strings, each matching a valid spec ID pattern
- `contentHashes` (required) must be a non-empty record of filename to hash
  string
- `rules` must be an array of objects with `requirement` and `rules`
- `constraints` must be a non-empty array of non-empty strings
- `scenarios` must be an array of objects with `requirement`, `name`, `when`,
  `then`, and `given`
- `optimizedDescription` must be a non-empty string
- `optimizedContext` must be a non-empty string
- `provenance` must conform to `SpecMetadataProvenance`

If validation fails, persistence is rejected with a typed validation error and
the file is not written. This guard is not a public editor: it is invoked only
internally by materialization, never by an external caller supplying arbitrary
content.

Unknown top-level keys are allowed (`.passthrough()`) to support
forward-compatible extensions.

### Requirement: Deterministic generation at archive time

`metadata.json` is generated deterministically by core as part of the `ArchiveChange` use case, but every metadata-related archive check that can still fail the archive attempt MUST complete during the full archive-batch preflight before canonical publication begins for any spec.

Archive-time flow for modified specs:

1. Prepare the merged canonical artifact content for every affected spec in memory.
2. Determine the final persisted `dependsOn` set for each archive-target spec.
3. Run `extractMetadata()` over the prepared merged content for each relevant spec and evaluate archive-time consistency requirements such as `dependsOn` mismatch detection.
4. Determine the final `spec-lock.json` content for each spec that will publish a sidecar.
5. Confirm that every metadata-related archive check across the full archive batch has succeeded.
6. Only then publish the canonical spec artifacts plus `spec-lock.json` for each spec as staged publication units.
7. After publication succeeds for a spec, run `GenerateSpecMetadata` against the canonical persisted spec.
8. Compute `contentHashes` for the required persisted spec artifacts and persist `metadata.json`.

The archive-owned persisted dependency rules are:

- If `change.specDependsOn` has an entry for the spec, that value is the final persisted `dependsOn` set for the archive attempt.
- If `metadataExtraction.dependsOn` returns a value during the pre-publication extraction pass, the extracted value MUST match the final persisted `dependsOn` set being sealed for that spec or archive fails.
- This mismatch rule applies both when a canonical `spec-lock.json` already exists and when the archive is creating `spec-lock.json` for the first time.
- If `metadataExtraction.dependsOn` is omitted, `metadata.json.dependsOn` MUST still be written from the final persisted dependency set.
- `metadata.json.dependsOn` is therefore the canonical normalized dependency field exposed to consumers, regardless of whether the underlying schema expresses dependencies in `spec.md`, another artifact, or only through persisted sidecar state.
- Outside archive, a legacy spec with no sidecar MAY still remain on extraction-backed metadata flows until opportunistic backfill succeeds.

`metadata.json.dependsOn` remains a supported consumer surface, but for persisted specs it is a projection of archive-owned persisted dependency state rather than an independent source of truth.

### Requirement: Freshness assessment is application-owned

Metadata freshness MUST be computed only by the pure application/domain
function `assessMetadataFreshness(persisted: SpecMetadata, current:
SpecMetadataSourceState): MetadataFreshnessAssessment`. `SpecRepository` MUST
NOT compute, return, or classify freshness itself; `readMetadataSnapshot()`
distinguishes only `missing`, `invalid`, and `present` persistence/parse
states.

`assessMetadataFreshness` compares:

- the exact artifact filename set and per-artifact content hashes in
  `provenance.artifacts` against the current artifact state
- `provenance.persistedStateHash` against the spec's current
  `persistedStateHash(spec)`, including the transition to or from lock absence
- `provenance.schema` against the spec's current persisted schema identity
- `provenance.projectionVersion` against the generator's current projection
  version
- `provenance.projectionFingerprint` against the current effective projection
  contract fingerprint

Metadata is stale when any of these comparisons differs. `lastModified` values
are diagnostic only and MUST NOT by themselves make metadata stale when the
corresponding hash is unchanged.

This comparison is used internally by `MaterializeSpecMetadata` to decide reuse
versus regeneration. It is not a repository responsibility and MUST NOT be
reimplemented independently by any repository adapter or by ordinary consumers.

### Requirement: Use by CompileContext

`CompileContext` and other context-oriented consumers obtain the canonical
normalized representation of persisted specs through Core metadata
materialization (`GetSpecMetadata` / `MaterializeSpecMetadata`), never by
calling `SpecRepository.readMetadataSnapshot()` directly to make a freshness
decision.

Materialization guarantees that a consumer requiring the normalized projection
receives a metadata value that is either confirmed fresh or was just
regenerated from current source state; consumers MUST NOT implement their own
missing/stale fallback logic against a raw repository snapshot.

`SpecRepository.readMetadataSnapshot()` remains available for materialization
internals and diagnostics that intentionally need the raw persisted/parse
state, but is not the path ordinary consumers use to obtain usable metadata.

### Requirement: Version control

`metadata.json` is a disposable generated cache, not authored content. New
projects initialize their metadata cache directory and add
`/.specd/metadata/` (rooted, so similarly named nested directories are
unaffected) to the project-root `.gitignore`.

Existing projects that already track generated metadata are not automatically
untracked — adding an ignore entry does not remove already-tracked files from
the Git index. Removing previously tracked metadata from version control is an
explicit one-time repository migration, not something runtime silently
performs.

When a project configures a custom filesystem `metadataPath`, keeping that path
out of version control is the operator's responsibility; runtime does not
rewrite `.gitignore` for arbitrary custom paths outside the default location.

### Requirement: Implementation projection

Generated metadata SHALL include an `implementation` property when the spec is linked to code files or symbols. This data is projected from the repository's persisted implementation semantics.

- **File-level links** are projected as `implementation.files: Array<{ specId, file }>`.
- **Symbol-level links** are projected as `implementation.symbols: Array<{ specId, file, symbol }>`.

If a spec has no persisted implementation links, the `implementation` property SHALL be omitted from the generated metadata.

## Pending

- **Spec index** — operations like `specd spec find --keyword <term>` currently require traversing all spec directories to read individual `metadata.json` files. If the number of specs grows to a point where traversal is slow, a generated index (analogous to the archive `index.jsonl`) should be introduced: individual files remain the source of truth, the index is derived and rebuilt via `specd spec reindex`. Not needed until there is a measurable performance problem.

## Constraints

- `metadata.json` is not a schema artifact — it is never listed in
  `requiredSpecArtifacts`, never validated by `ValidateArtifacts`, and never
  tracked in the change manifest's `artifacts` array
- Its absence is not an error at any point — all reads of metadata treat a
  missing file as empty
- `dependsOn` paths must not form cycles; if a cycle is detected during
  traversal, specd breaks the cycle and emits a warning
- Staleness is an internal materialization decision, not a public status;
  ordinary consumers self-heal through materialization instead of acting on a
  raw staleness flag
- No process may include the spec itself in its own `dependsOn` list
- The internal metadata-persistence guard must validate content against the
  structural contract before writing — structurally invalid content is
  rejected and not written
- `dependsOn` in generated metadata is never independently authored or subject
  to overwrite comparison — it is always a direct projection of the spec's
  current persisted dependency state
- Reading metadata (`parseMetadata`) remains lenient — it returns `{}` on
  invalid input so that downstream operations are never blocked by a malformed
  file on disk
- Metadata is accessed exclusively via `SpecRepository.readMetadataSnapshot()`
  and `SpecRepository.writeMetadataSnapshot()` — never via the generic
  `artifact()` / `save()` methods
- Metadata content, including `optimizedDescription` and `optimizedContext`, is
  never a source of truth — `spec-lock.json` owns dependency, implementation,
  and optimization state; metadata is always a regenerable projection

## Spec Dependencies

- [`core:config`](../config/spec.md) — context spec selection and resolution
  order
- [`core:change`](../change/spec.md) — `specDependsOn` in the change manifest,
  per-spec declared dependencies
- [`core:schema-format`](../schema-format/spec.md) — `requiredSpecArtifacts`,
  used to determine which files to hash for staleness detection
- [`core:content-extraction`](../content-extraction/spec.md) — the extraction
  engine used as CompileContext fallback when metadata is stale
- [`core:spec-repository-port`](../spec-repository-port/spec.md) —
  `readMetadataSnapshot()` and `writeMetadataSnapshot()` methods used for all
  metadata access
- [`core:spec-lock`](../spec-lock/spec.md) — durable archived dependency,
  implementation, and optimization source of truth
- [`core:spec-optimization`](../spec-optimization/spec.md) — the per-field
  optimization record and freshness reasons projected into
  `optimizedDescription` / `optimizedContext`
