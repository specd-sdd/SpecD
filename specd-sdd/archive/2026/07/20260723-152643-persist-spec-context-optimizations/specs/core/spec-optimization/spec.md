# core:spec-optimization

## Purpose

Agent-authored optimized content (`optimizedDescription`, `optimizedContext`) is a durable authoring decision, not a disposable cache value, so it must survive independently of metadata regeneration and must never be served after the artifacts or schema it was produced from have changed. `spec-optimization` defines the per-field optimization record persisted in `spec-lock.json`, the artifact/schema baseline each field owns, and the freshness reasons used to decide whether a persisted optimization is still trustworthy.

## Requirements

### Requirement: Optimization fields are independent

`PersistedSpecOptimizations` MUST record at most two optional fields, `optimizedDescription` and `optimizedContext`. Each present field MUST be an independent `PersistedOptimizationField` with its own value and its own baseline.

Setting, clearing, or invalidating one field MUST NOT read, modify, or refresh the baseline of the other field. A spec MAY have a fresh `optimizedDescription` and a stale `optimizedContext` at the same time, or vice versa.

### Requirement: Optimization field shape

Each `PersistedOptimizationField` MUST contain:

- `value` — the optimized string content produced for that field
- `schema` — the `PersistedSchemaIdentity` (`{ name, version }`) that was active when the baseline was captured
- `artifactState` — the `PersistedArtifactState` baseline the value was produced from

`PersistedArtifactState` MUST be a map keyed by artifact filename, where each entry is a `PersistedArtifactStateEntry` containing:

- `hash` — the raw UTF-8 SHA-256 content hash of that artifact at baseline time
- `lastModified` — the diagnostic last-modified stamp of that artifact at baseline time

### Requirement: Baseline content and ordering

The `artifactState` baseline for a field MUST contain exactly the artifacts the active schema declares with `scope: spec` that are present on disk at the time the baseline is captured, keyed by filename.

The baseline MUST exclude:

- `metadata.json`
- `spec-lock.json`
- change-scoped artifacts
- optional artifacts that are absent
- any file not declared as a `scope: spec` artifact by the active schema

Baseline entries MUST be constructed in filename-ascending order before persistence, so that the serialized baseline is deterministic for a given artifact set.

### Requirement: Content hash identity

The `hash` recorded in a `PersistedArtifactStateEntry` MUST be the SHA-256 digest of the artifact's raw UTF-8 byte content. This hash is the authoritative identity used for freshness comparison; `lastModified` MUST NOT be used to decide freshness.

### Requirement: Per-field freshness reasons

Comparing a field's persisted `artifactState` against the current artifact state MUST classify each artifact into one of:

- `artifact-added` — the artifact exists in the current state but not in the baseline
- `artifact-removed` — the artifact exists in the baseline but not in the current state
- `artifact-changed` — the artifact exists in both, and the current hash differs from the baseline hash
- unchanged — the artifact exists in both with an equal hash

An artifact whose hash is equal but whose `lastModified` differs between baseline and current state MUST be reported as a diagnostic only and MUST NOT by itself make the field stale.

A field with no persisted value MUST be reported as `missing`. `missing` is a normal absence state, not a validation error.

An optimization field is stale when at least one artifact in its baseline is classified `artifact-added`, `artifact-removed`, or `artifact-changed`, or when the field's recorded `schema` no longer equals the spec's currently persisted schema identity.

### Requirement: Schema reassignment invalidates baselines

Because each optimization field records the schema identity active when its baseline was captured, reassigning the persisted schema for a spec MUST make every existing optimization field stale, even when none of the underlying artifact bytes changed.

### Requirement: Clearing the last field removes the optimizations block

When an operation clears an optimization field and no other optimization field remains present, the persisted state MUST omit `optimizations` entirely rather than persisting an empty object.

### Requirement: Backward compatibility with lock-less optimizations

A `spec-lock.json` document written before this capability existed, and therefore lacking `optimizations`, MUST remain valid. Its absence MUST be treated identically to a lock whose `optimizations` block is present but has no fields set.

### Requirement: No implicit migration from metadata

No process MAY copy `optimizedDescription` or `optimizedContext` values, or any freshness signal, from `metadata.json` into `PersistedSpecOptimizations`. Optimization state is authored only through explicit persisted-optimization mutation; it is never inferred or imported from a generated cache.

## Constraints

- `PersistedSpecOptimizations`, when present, MUST contain at least one of `optimizedDescription` or `optimizedContext`.
- Baseline hashing MUST use the same raw UTF-8 SHA-256 algorithm used elsewhere for artifact content identity.
- Consumers MUST NOT treat an unequal `lastModified` with an equal `hash` as staleness.

## Spec Dependencies

- [`core:spec-lock`](../spec-lock/spec.md) — the durable sidecar document that stores `PersistedSpecOptimizations` as part of persisted spec state
- [`core:spec-repository-port`](../spec-repository-port/spec.md) — the repository boundary through which persisted optimization state is read and written
