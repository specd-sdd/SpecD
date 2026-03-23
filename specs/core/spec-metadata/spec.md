# Spec Metadata

## Purpose

Tooling and AI agents need a compact, machine-readable summary of each spec — its dependencies, content hashes, rules, and scenarios — without parsing the full artifact files every time. Each spec has a corresponding `metadata.yaml` file stored under `.specd/metadata/<specPath>/`, separate from the spec's content artifacts. It is generated deterministically by core at archive time using the schema's `metadataExtraction` engine and is not part of the schema artifact system; content hashes enable staleness detection so consumers know when to regenerate.

## Requirements

### Requirement: File location and naming

`metadata.json` lives under the `.specd/metadata/` directory, mirroring the spec's capability path:

```
.specd/metadata/core/config/
└── metadata.json

specs/core/config/
├── spec.md          ← user content only
└── verify.md
```

The metadata root path is configured per workspace via `specs.fs.metadataPath` in `specd.yaml`. When not set, the composition layer auto-derives it from the VCS root of the workspace's specs path: `createVcsAdapter(specs.path).rootDir()` + `/.specd/metadata/`. This works across heterogeneous VCS setups (git, hg, svn). When `NullVcsAdapter` is returned (specs path is not inside any VCS), the fallback is `.specd/metadata/` relative to the specs root parent directory. The `FsSpecRepository` adapter receives the resolved path as config — it does not perform VCS detection itself.

The file's absence is not an error — a spec with no `metadata.json` is treated as having no declared dependencies and no recorded content hash.

### Requirement: File format

`metadata.json` is a JSON file (per ADR-0019: machine-generated files use JSON). All fields are optional — an empty object or absent file is valid:

```json
{
  "title": "Change",
  "description": "The central domain entity in specd.",
  "dependsOn": ["core:core/storage", "core:core/delta-format"],
  "contentHashes": {
    "spec.md": "sha256:abc123..."
  },
  "rules": [{ "requirement": "Lifecycle states", "rules": ["..."] }],
  "constraints": ["..."],
  "scenarios": [{ "requirement": "...", "name": "...", "given": [], "when": [], "then": [] }],
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
- `generatedBy` — `"core"` for deterministic extraction, `"agent"` for LLM-optimized

### Requirement: Write-time structural validation

The `SaveSpecMetadata` use case validates the YAML content against the `strictSpecMetadataSchema` Zod schema before writing. The content must be a YAML mapping (not empty, not a scalar). `title` and `description` are required; other fields are optional but when present must conform to their declared types and formats:

- `title` (required) must be a non-empty string
- `description` (required) must be a non-empty string
- `keywords` must be an array of non-empty lowercase strings
- `dependsOn` must be an array of strings, each matching a valid spec ID pattern (`capabilityPath` or `workspace:capabilityPath` where workspace matches `/^[a-z][a-z0-9-]*$/` and capability path segments match `/^[a-z0-9_][a-z0-9_-]*$/`)
- `contentHashes` (required) must be a non-empty record of filename to hash string, where each hash matches `sha256:<64 hex chars>`
- `rules` must be an array of objects with `requirement` (non-empty string) and `rules` (non-empty array of non-empty strings)
- `constraints` must be a non-empty array of non-empty strings
- `scenarios` must be an array of objects with `requirement` (non-empty string), `name` (non-empty string), `when` (non-empty array of strings), `then` (non-empty array of strings), and `given` (optional array of strings)

If validation fails, `SaveSpecMetadata` throws a `MetadataValidationError` (a domain error extending `SpecdError`) with the Zod issues formatted as a human-readable message. The file is not written.

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

`metadata.yaml` is generated deterministically by core as part of the `ArchiveChange` use case. After merging deltas and syncing specs, `ArchiveChange` generates metadata for each modified spec:

1. Load the spec's `requiredSpecArtifacts` from the workspace's `SpecRepository`
2. Parse each artifact via its `ArtifactParser` to obtain an AST
3. Run `extractMetadata()` with the schema's `metadataExtraction` declarations to extract `title`, `description`, `dependsOn`, `keywords`, `rules`, `constraints`, and `scenarios`
4. If `change.specDependsOn` has an entry for the spec, use it as `dependsOn` instead of the extracted value (manifest dependencies take priority)
5. Compute `contentHashes` by hashing each `requiredSpecArtifacts` file
6. Write the result via `SaveSpecMetadata`

If extraction produces no `title` or `description` (e.g. the spec has no `# Title` heading or `## Overview` section), the corresponding fields are omitted and `SaveSpecMetadata` will reject the write — the spec must conform to the schema's extraction declarations.

After generation, the metadata is stable until the spec is modified again by a subsequent change. The LLM may improve metadata at any point (e.g. refining `description` or `keywords`) by calling `SaveSpecMetadata` directly — the deterministic baseline ensures metadata always exists after archive.

### Requirement: Staleness detection

When specd reads a spec's metadata via `SpecRepository.metadata()`, it iterates over the active schema's `requiredSpecArtifacts`, resolves the concrete filename for each artifact via its `output` field, computes the current SHA-256 hash of that file, and compares it against the entry in `contentHashes` keyed by that filename. If any file's hash differs, a resolved filename is missing from `contentHashes`, or `contentHashes` itself is absent, specd emits a warning indicating that the spec has changed since the metadata was last derived and that the agent should review and regenerate metadata.

A missing `contentHashes` field is treated as stale — specd emits the same warning.

Staleness is advisory only. specd does not block any operation because metadata is stale.

### Requirement: Use by CompileContext

`CompileContext` reads metadata via `SpecRepository.metadata()` for two purposes:

1. **Spec collection** — `dependsOn` is followed transitively from `change.specIds` to discover which specs to include in the context. The full resolution order is defined in [`specs/core/config/spec.md`](../config/spec.md) — Requirement: Context spec selection. When metadata is absent for a spec during `dependsOn` traversal, a `missing-metadata` warning is emitted. `CompileContext` then attempts to extract `dependsOn` from the spec content using the schema's `metadataExtraction` declarations as a best-effort fallback.
2. **Spec content** — for each spec in the collected context set, if metadata is fresh, `CompileContext` uses `description`, `rules`, `constraints`, and `scenarios` as the compact, machine-optimised representation of that spec. If metadata is absent or stale, `CompileContext` falls back to the schema's `metadataExtraction` declarations to extract the same fields deterministically and emits a staleness warning.

A spec that cannot be resolved (missing file, unknown workspace) is silently skipped with a warning.

### Requirement: Version control

`metadata.yaml` files under `.specd/metadata/` must be committed to version control alongside the project. The `.specd/metadata/` directory must not be added to `.gitignore`.

## Pending

- **Spec index** — operations like `specd spec find --keyword <term>` currently require traversing all spec directories to read individual `.specd-metadata.yaml` files. If the number of specs grows to a point where traversal is slow, a generated index (analogous to the archive `index.jsonl`) should be introduced: individual files remain the source of truth, the index is derived and rebuilt via `specd spec reindex`. Not needed until there is a measurable performance problem.

## Constraints

- `metadata.yaml` is not a schema artifact — it is never listed in `requiredSpecArtifacts`, never validated by `ValidateArtifacts`, and never tracked in the change manifest's `artifacts` array
- Its absence is not an error at any point — all reads of metadata treat a missing file as empty
- `dependsOn` paths must not form cycles; if a cycle is detected during traversal, specd breaks the cycle and emits a warning
- Staleness warnings are advisory only — they do not block any operation
- The LLM must not include the spec itself in its own `dependsOn` list
- `SaveSpecMetadata` must validate content against `specMetadataSchema` before writing — structurally invalid content is rejected with `MetadataValidationError`
- `SaveSpecMetadata` must check for `dependsOn` overwrite before writing — changed `dependsOn` without `force` is rejected with `DependsOnOverwriteError`
- Reading metadata (`parseMetadata`) remains lenient — it returns `{}` on invalid input so that downstream operations are never blocked by a malformed file on disk
- Metadata is accessed exclusively via `SpecRepository.metadata()` and `SpecRepository.saveMetadata()` — never via the generic `artifact()` / `save()` methods

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — context spec selection and resolution order
- [`specs/core/change/spec.md`](../change/spec.md) — `specDependsOn` in the change manifest, per-spec declared dependencies
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `requiredSpecArtifacts`, used to determine which files to hash for staleness detection
- [`specs/core/content-extraction/spec.md`](../content-extraction/spec.md) — the extraction engine used as CompileContext fallback when metadata is stale
- [`specs/core/spec-repository-port/spec.md`](../spec-repository-port/spec.md) — `metadata()` and `saveMetadata()` methods used for all metadata access
