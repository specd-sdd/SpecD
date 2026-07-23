# Validation Result Cache Port

## Purpose

`ValidateSpecs` needs to memoize per-spec validation outcomes across runs without forcing
delivery hosts to know that a cache exists. `ValidationResultCache` is a
**ValidateSpecs-specific** application port: it owns the freshness cascade for that use
case (including lazy I/O against `SpecRepository`) so adapters can persist outcomes under
a swappable storage backend while the public validate API stays unchanged.

## Requirements

### Requirement: Abstract port shape

The port MUST be declared as a TypeScript `abstract class` named `ValidationResultCache` in
`application/ports/`. Concrete behaviour SHALL live only in infrastructure adapters.

### Requirement: Workspace-scoped instances

Each port instance MUST be bound to a single workspace identity for the lifetime of the
instance. Use cases that validate multiple workspaces MUST receive one instance per
workspace (or an equivalent workspace-keyed registry resolved by composition).

### Requirement: SpecRepository injected at construction

Because this port owns the ValidateSpecs freshness cascade, each instance MUST receive
the workspace `SpecRepository` (same workspace identity) at **construction time** via
composition. The repository MUST NOT be passed on every `lookup` / `upsert` call.

Construction contract:

- The abstract port (or its concrete adapters) MUST accept `SpecRepository` as a
  constructor dependency (directly or via a narrow deps object that includes it).
- The injected repository's `workspace()` MUST match the cache instance's workspace.
- Adapters MAY also receive storage/path deps (e.g. `configPath`) in the same
  constructor; those remain infrastructure concerns.
- `lookup` / `upsert` method signatures MUST NOT take a `SpecRepository` parameter.

The injected repository is how the cache loads cheap `Spec` stamps (`get()`), computes
`specFingerprint()`, and hashes raw metadata bytes for `cacheFingerprint`. The cache
MUST NOT invent SpecRepository stamp helpers (`validationSourceStamps`,
`readValidationSidecar`); it MUST use the contractual repository APIs above.

### Requirement: Cached entry payload

A cached entry MUST be a `SpecValidationEntry` (or an equivalent structural alias):

- `spec` — qualified label `workspace:capabilityPath`
- `passed` — `true` when `failures` is empty
- `failures` — array of validation failure records
- `warnings` — array of validation warning records

Adapters MUST persist pass and fail outcomes alike. Omitting failures or warnings from a
completed validation MUST NOT be permitted.

### Requirement: Bucket validity inputs

Before serving any row, adapters MUST evaluate bucket-level validity using:

- `schemaFingerprint` — opaque string identifying the active schema validation surface
- `engineVersion` — non-negative integer identifying the evaluation engine revision
- an invalidation flag equivalent to list-index `isInvalidated`

When bucket validity fails, every lookup for that workspace MUST miss until the bucket is
rebuilt or rewritten with matching validity inputs.

`schemaFingerprint` and `engineVersion` are supplied by `ValidateSpecs` / composition for
the active schema and evaluation engine. Their construction rules for ValidateSpecs live
in [`core:validate-specs`](../validate-specs/spec.md).

### Requirement: Stored freshness fields

Each stored row MUST retain:

- stamps derived from `Spec` via `get()` — `SpecArtifactEntry.lastModified` for each
  present artifact, `persistedStateStamp.{present,lastModified}`, and
  `generatedMetadataStamp.{present,lastModified}`
- `cacheFingerprint` — opaque digest computed by this port (not by ValidateSpecs)

### Requirement: cacheFingerprint canonical form

`cacheFingerprint` MUST be the content hash of sorted-key JSON with exactly:

```text
{
  specFingerprint: <digest from SpecRepository.specFingerprint(spec)>,
  metadataContentHash: <digest of raw metadata.json bytes> | "__absent__"
}
```

Rules:

- `specFingerprint` MUST come from `SpecRepository.specFingerprint(spec)` (artifacts +
  `persistedStateHash`; never includes metadata).
- `metadataContentHash` MUST hash the **raw** generated metadata file bytes when
  present. It MUST NOT require calling `metadata()` (no JSON parse / freshness
  classification on this path).
- When the metadata file is absent, `metadataContentHash` MUST be the literal
  `"__absent__"`.
- Adapters MUST NOT invent a third flat fingerprint that re-lists artifact
  filenames + lock + metadata into one payload; composition of the two digests above
  is the contract.

### Requirement: Lookup cascade owned by the cache

`lookup` MUST own freshness evaluation for one spec. ValidateSpecs MUST NOT precompute
stamps or fingerprints for the cascade and MUST NOT drive soft-hit persistence.

For each lookup the cache MUST:

1. If bucket validity fails → return miss.
2. Load current stamps via `SpecRepository.get()` (no artifact content reads).
3. If stored stamps match current stamps → **hard hit**: return `{ kind: 'hit', entry }`
   without computing `cacheFingerprint` or revalidating.
4. If stamps differ → compute `cacheFingerprint` lazily using the canonical form in
   this spec. If it matches the stored fingerprint → **soft hit**: persist refreshed
   stamps without changing `cacheFingerprint` or `entry`, then return
   `{ kind: 'hit', entry }`.
5. Otherwise → return `{ kind: 'miss' }`.

### Requirement: Lookup result shape

`lookup` MUST return only:

- `{ kind: 'hit', entry: SpecValidationEntry }` — hard or soft hit
- `{ kind: 'miss' }`

Soft-hit stamp refresh MUST NOT be exposed to callers (no `refreshStamps` flag or
equivalent).

### Requirement: Method signatures

The port MUST expose:

- `workspace(): string`
- `lookup(input: {
  spec: Spec
  schemaFingerprint: string
  engineVersion: number
  }): Promise<
  | { kind: 'hit'; entry: SpecValidationEntry }
  | { kind: 'miss' }
  > `
- `upsert(input: {
  entry: SpecValidationEntry
  spec: Spec
  schemaFingerprint: string
  engineVersion: number
}): Promise<void>`

`schemaFingerprint` / `engineVersion` on `lookup` are bucket-validity inputs only.
`lookup` / `upsert` receive `Spec` so the cache knows which row to touch; freshness
I/O (stamps, `specFingerprint`, raw metadata hash) still goes through the
**constructor-injected** `SpecRepository`. They MUST NOT accept stamps,
`cacheFingerprint`, `refreshStamps`, or a repository argument.

### Requirement: Upsert inputs

After a full validation miss, `ValidateSpecs` MUST call `upsert` with:

- `entry` — the completed `SpecValidationEntry`
- `spec` — the `Spec` for the validated row
- `schemaFingerprint` and `engineVersion` for bucket validity

The use case MUST NOT pass stamps or `cacheFingerprint`. The cache MUST materialize
current stamps and `cacheFingerprint` via its injected `SpecRepository` the same way
`lookup` does, then persist the row and update bucket meta.

### Requirement: Host opacity

Delivery hosts (CLI, MCP, plugins, and other adapters) MUST NOT depend on this port.
Composition MAY wire the port into `ValidateSpecs` only. Public host APIs MUST NOT expose
cache controls, cache paths, or cache-specific flags.

### Requirement: No side-channel through SpecRepository list cache

This port MUST NOT be implemented as a hidden concern inside `SpecRepository` list/count
index helpers or `FsSpecIndexCache`. List-index caches remain separate from
validation-result persistence. Persistence of validation outcomes MUST go through
`ValidationResultCache` only.

## Constraints

- The port lives in `application/ports/` per hexagonal architecture rules.
- The port contract MUST be exported from the curated `@specd/core/ports` public barrel
  (`packages/core/src/ports.ts`), consistent with other application ports.
- Adapters MUST treat cache storage as runtime state, not as committed project content.
- Port methods MUST NOT perform schema rule evaluation; they store and retrieve outcomes
  and evaluate freshness only.
- The port is ValidateSpecs-specific; it MUST NOT be treated as a general-purpose cache
  that is forbidden from knowing ValidateSpecs’ freshness model.

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal
  architecture and port placement rules
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — `Spec` stamps,
  `specFingerprint`, and repository APIs used for lazy freshness
