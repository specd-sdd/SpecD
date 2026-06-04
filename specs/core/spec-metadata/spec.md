# Spec Metadata

## Purpose

Tooling and AI agents need a compact, machine-readable summary of each spec — its dependencies, content hashes, rules, and scenarios — without parsing the full artifact files every time. Each spec has a corresponding `metadata.json` file stored under `.specd/metadata/<workspace>/<capability-path>/`, separate from the spec's content artifacts. It is generated deterministically by core at archive time using the schema's `metadataExtraction` engine and is not part of the schema artifact system; content hashes enable staleness detection so consumers know when to regenerate.

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

### Requirement: File format

`metadata.json` is a JSON file (per ADR-0019: machine-generated files use JSON). All fields are optional — an empty object or absent file is valid:

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
  "generatedBy": "core"
}
```

Fields:

- `title` — human-readable display title
- `description` — short summary of the spec's purpose
- `keywords` — lowercase hyphen-separated discovery tokens
- `dependsOn` — array of spec IDs this spec depends on
- `contentHashes` — `{ filename: "sha256:<hex>" }` for staleness detection
- `rules` — extracted requirements grouped by heading
- `constraints` — extracted constraint bullets
- `scenarios` — extracted verification scenarios
- `context` — freeform context strings
- `optimizedDescription` — optional concise, high-signal description for agents
- `optimizedContext` — optional optimized representation for agent context injection
- `generatedBy` — `"core"` for deterministic extraction, `"agent"` for LLM-optimized

### Requirement: Write-time structural validation

The `SaveSpecMetadata` use case validates JSON content against the `strictSpecMetadataSchema` Zod schema before writing. The content must be a JSON object. `title` and `description` are required; other fields are optional but when present must conform to their declared types and formats:

- `title` (required) must be a non-empty string
- `description` (required) must be a non-empty string
- `keywords` must be an array of non-empty lowercase strings
- `dependsOn` must be an array of strings, each matching a valid spec ID pattern
- `contentHashes` (required) must be a non-empty record of filename to hash string
- `rules` must be an array of objects with `requirement` and `rules`
- `constraints` must be a non-empty array of non-empty strings
- `scenarios` must be an array of objects with `requirement`, `name`, `when`, `then`, and `given`
- `optimizedDescription` must be a non-empty string
- `optimizedContext` must be a non-empty string

If validation fails, `SaveSpecMetadata` throws a `MetadataValidationError`. The file is not written.

Unknown top-level keys are allowed (`.passthrough()`) to support forward-compatible extensions.

### Requirement: dependsOn overwrite protection

Existing `dependsOn` entries are considered curated — they may have been manually added, verified by a human, or set via `change.specDependsOn`. `SaveSpecMetadata` must prevent silent overwrites:

1. When `force` is not set: before writing, read the existing metadata via `SpecRepository.metadata()` and capture its `originalHash`. This hash is passed to `SpecRepository.saveMetadata()` so that the repository layer can detect concurrent modifications.
2. Parse both existing and incoming metadata to extract their `dependsOn` arrays
3. Compare the two arrays **ignoring order** (sorted comparison)
4. If the existing metadata has `dependsOn` entries and the incoming `dependsOn` differs → throw `DependsOnOverwriteError`
5. If the existing metadata has no `dependsOn` (absent or empty array) → allow any incoming `dependsOn`
6. When `force` is set: skip this check entirely

`DependsOnOverwriteError` is a domain error extending `SpecdError` with code `DEPENDS_ON_OVERWRITE`. It exposes:

- `existingDeps: readonly string[]` — the entries currently on disk
- `incomingDeps: readonly string[]` — the entries in the incoming content
- A human-readable message listing which entries would be removed and which would be added

A static helper `DependsOnOverwriteError.areSame(a, b)` compares two `dependsOn` arrays for equality ignoring order.

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
- Outside archive, a legacy spec with no sidecar MAY still remain on extraction-backed metadata flows until opportunistic backfill succeeds.

`metadata.json.dependsOn` remains a supported consumer surface, but for persisted specs it is a projection of the archive-owned sidecar state rather than an independent source of truth.

### Requirement: Staleness detection

When specd reads a spec's metadata via `SpecRepository.metadata()`, it iterates over the active schema's `requiredSpecArtifacts`, resolves the concrete filename for each artifact via its `output` field, computes the current SHA-256 hash of that file, and compares it against the entry in `contentHashes` keyed by that filename. If any file's hash differs, a resolved filename is missing from `contentHashes`, or `contentHashes` itself is absent, specd emits a warning indicating that the spec has changed since the metadata was last derived and that the agent should review and regenerate metadata.

A missing `contentHashes` field is treated as stale — specd emits the same warning.

Staleness is advisory only. specd does not block any operation because metadata is stale.

### Requirement: Use by CompileContext

`CompileContext` reads metadata via `SpecRepository.metadata()` for two purposes:

1. **Spec collection** — `dependsOn` is followed transitively from `change.specIds` to discover which specs to include in the context. The full resolution order is defined in [`core:config`](../config/spec.md) — Requirement: Context spec selection. When metadata is absent for a spec during `dependsOn` traversal, a `missing-metadata` warning is emitted. `CompileContext` then attempts to extract `dependsOn` from the spec content using the schema's `metadataExtraction` declarations as a best-effort fallback.
2. **Spec content** — for each spec in the collected context set, if metadata is fresh, `CompileContext` uses `description`, `rules`, `constraints`, and `scenarios` as the compact, machine-optimised representation of that spec. If metadata is absent or stale, `CompileContext` falls back to the schema's `metadataExtraction` declarations to extract the same fields deterministically and emits a staleness warning.

A spec that cannot be resolved (missing file, unknown workspace) is silently skipped with a warning.

### Requirement: Version control

`metadata.json` files under `.specd/metadata/` must be committed to version control alongside the project. The `.specd/metadata/` directory must not be added to `.gitignore`.

### Requirement: Implementation projection

Generated metadata SHALL include an `implementation` property when the spec is linked to code files or symbols. This data is projected from the repository's persisted implementation semantics.

- **File-level links** are projected as `implementation.files: Array<{ specId, file }>`.
- **Symbol-level links** are projected as `implementation.symbols: Array<{ specId, file, symbol }>`.

If a spec has no persisted implementation links, the `implementation` property SHALL be omitted from the generated metadata.

## Pending

- **Spec index** — operations like `specd spec find --keyword <term>` currently require traversing all spec directories to read individual `metadata.json` files. If the number of specs grows to a point where traversal is slow, a generated index (analogous to the archive `index.jsonl`) should be introduced: individual files remain the source of truth, the index is derived and rebuilt via `specd spec reindex`. Not needed until there is a measurable performance problem.

## Constraints

- `metadata.json` is not a schema artifact — it is never listed in `requiredSpecArtifacts`, never validated by `ValidateArtifacts`, and never tracked in the change manifest's `artifacts` array
- Its absence is not an error at any point — all reads of metadata treat a missing file as empty
- `dependsOn` paths must not form cycles; if a cycle is detected during traversal, specd breaks the cycle and emits a warning
- Staleness warnings are advisory only — they do not block any operation
- The LLM must not include the spec itself in its own `dependsOn` list
- `SaveSpecMetadata` must validate content against `strictSpecMetadataSchema` before writing — structurally invalid content is rejected with `MetadataValidationError`
- `SaveSpecMetadata` must check for `dependsOn` overwrite before writing — changed `dependsOn` without `force` is rejected with `DependsOnOverwriteError`
- Reading metadata (`parseMetadata`) remains lenient — it returns `{}` on invalid input so that downstream operations are never blocked by a malformed file on disk
- Metadata is accessed exclusively via `SpecRepository.metadata()` and `SpecRepository.saveMetadata()` — never via the generic `artifact()` / `save()` methods

## Spec Dependencies

- [`core:config`](../config/spec.md) — context spec selection and resolution order
- [`core:change`](../change/spec.md) — `specDependsOn` in the change manifest, per-spec declared dependencies
- [`core:schema-format`](../schema-format/spec.md) — `requiredSpecArtifacts`, used to determine which files to hash for staleness detection
- [`core:content-extraction`](../content-extraction/spec.md) — the extraction engine used as CompileContext fallback when metadata is stale
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `metadata()` and `saveMetadata()` methods used for all metadata access
- [`core:spec-lock`](../spec-lock/spec.md) — durable archived implementation traceability source
