# core:spec-lock

## Purpose

Archived specs need a durable sidecar that preserves spec identity, persisted
dependencies, implementation traceability, and per-field LLM optimization state
independently of metadata regeneration or graph re-indexing. `spec-lock.json` is
that sidecar: the canonical persisted record for spec schema identity,
dependencies, implementation links, and optional optimization baselines.

A spec's canonical artifacts MAY exist before this sidecar does. Persisted state
comes into being deliberately — through archive publication, an explicit
one-time initialization/adoption operation, or an explicit persisted-state
mutation — never as an incidental guess constructed from a stale cache.

## Requirements

### Requirement: Sidecar location and naming

The sidecar SHALL be a file named `spec-lock.json` located in the canonical persisted spec directory next to that spec's archived artifacts.

### Requirement: Durable schema identity

`spec-lock.json` MUST store the spec schema identity under `schema`.

- `schema.name` is required.
- `schema.version` is required.

Once recorded for a persisted spec, this schema identity MUST remain immutable
except through an explicit, guarded schema-reassignment operation (see
Requirement: Guarded schema reassignment). No other write path — including
archive-time materialization, dependency mutation, implementation mutation, or
optimization mutation — MAY replace an existing `schema` value.

### Requirement: Guarded schema reassignment

An explicit schema-reassignment operation MAY replace the `schema` recorded for
an already-initialized spec. Reassignment MUST:

- resolve and load the target schema's declared canonical artifacts and verify
  they parse under that schema before replacing `schema`
- preserve current `dependsOn` unchanged when the target schema does not declare
  dependency extraction
- require that dependencies extracted under the target schema equal the current
  canonical `dependsOn`, failing the operation rather than silently changing
  dependencies, when the target schema does declare dependency extraction
- preserve `implementation` and any `optimizations` values and baselines
  unchanged

Because each optimization baseline records the schema identity in effect when it
was captured, a schema reassignment makes every existing optimization stale
relative to the new schema even though its artifact bytes and `value` are
unchanged. Reassignment MUST NOT clear or regenerate optimization values as a
side effect; staleness is derived, not enforced by deletion.

Selecting the schema identity already recorded is a semantic no-op and MUST NOT
be treated as a failure.

### Requirement: Persistent dependencies

`spec-lock.json` MUST store the final persisted `dependsOn` list for the archived spec as canonical spec IDs.

This sidecar list is the durable archived dependency record. Archive-time metadata generation and later metadata regeneration flows SHALL treat it as the authoritative persisted dependency state when projecting canonical `metadata.json.dependsOn`, including schemas that do not declare dependency extraction in their spec artifacts.

### Requirement: Archived implementation links

`spec-lock.json` MUST store archived implementation traceability under an `implementation` array.

Each entry MUST contain:

- `file` — the canonical implementation file identity in `workspace:path` form, where `workspace` is the workspace of `specId` and `path` is relative to that workspace `codeRoot`

Each entry MAY additionally contain:

- `symbols` — a non-empty array of symbol names when the archived link is symbol-level

When `symbols` is absent, the entry represents a file-level implementation link. When `symbols` is present, the entry represents symbol-level implementation traceability for that file.

### Requirement: Optional persisted optimization state

`spec-lock.json` MAY store per-field LLM optimization state under an optional
`optimizations` object.

Each present field (`optimizedDescription`, `optimizedContext`) MUST record:

- `value` — the optimized string content
- `schema` — the schema identity in effect when the field was captured, in the
  same `{ name, version }` shape as the lock's own `schema`
- `artifactState` — a map of artifact filename to `{ hash, lastModified }`
  describing the exact canonical artifact set the value was produced from

Each optimized field owns an independent artifact and schema baseline. Setting
or clearing one field MUST NOT change the baseline recorded for the other. When
the last present field is cleared, `optimizations` MUST be omitted entirely
rather than retained as an empty object.

A lock written before this requirement existed and containing no `optimizations`
block remains valid. No migration MAY synthesize `optimizations` from previously
agent-generated `metadata.json` fields; only an explicit optimization-setting
operation creates this state.

### Requirement: Lock-less specs and explicit initialization

A spec MAY have canonical artifacts without a `spec-lock.json`. This lock-less
state is valid and MUST NOT be silently upgraded by an ordinary read.

Persisted state for a lock-less spec MUST be created only by:

- archive publication of a change targeting that spec, or
- an explicit initialization operation that adopts existing artifacts into
  persisted state, or
- an explicit persisted-state mutation (dependency, implementation, or
  optimization) that is itself a create-worthy operation for that spec

Explicit initialization is a one-time adoption: it MUST fail when persisted
state already exists for the target spec, regardless of whether the requested
schema identity matches. Explicit initialization MUST derive `dependsOn` from
the current canonical artifacts under the resolved schema rather than from any
cached projection, default `implementation` to an empty array, and omit
`optimizations`.

Semantic no-op mutations against a lock-less spec (e.g. removing a dependency
that is not present, removing an implementation link that is not present, or
clearing an optimization field that is not set) MUST NOT create persisted state.

### Requirement: Archive-time materialization

`spec-lock.json` SHALL be written or updated only by archive-time
materialization, explicit persisted-state mutation operations (dependency,
implementation, optimization, and schema-reassignment updates), explicit
initialization of a lock-less spec, and explicit integrity-maintenance flows.

Archive-time materialization MUST:

- read raw project-relative implementation paths from the active change state
- validate that each linked file belongs to the workspace implied by the
  archived `specId`
- ignore entries whose raw file path falls under that workspace's
  `graph.excludePaths`
- discard entries that cannot be normalized into a valid `workspace:path`
  identity
- fail archive when a confirmed link points outside the workspace `codeRoot`
  implied by `specId`

Every non-archive writer listed above MUST construct the complete persisted
state through the shared pure patch/construction rules for this document rather
than hand-assembling partial JSON, and MUST use a conditional write guarded by
the observed revision so concurrent writers cannot silently overwrite each
other.

### Requirement: Sidecar is the durable source of truth

`spec-lock.json` MUST be the durable archived source of truth for
implementation traceability and, when present, per-field LLM optimization
state.

`metadata.json` MAY project or cache this information for faster consumption,
but metadata regeneration MUST NOT invent, mutate, or delete implementation
links or optimization values independently of the sidecar. A generated
projection MUST include an optimized field only when the sidecar's baseline for
that field is fresh against current canonical artifacts and schema identity.

### Requirement: Repository hash of persisted lock state

The SHA-256 of the durable lock sidecar bytes MUST be the value returned by
`SpecRepository.persistedStateMeta(spec, { includeHash: true })?.hash`
(formerly exposed via a dedicated `specHash` / `persistedStateHash` helper).
Application callers MUST obtain that digest only through the repository port —
not by reading `spec-lock.json` directly. There MUST NOT be a separate
`persistedStateHash(spec)` method on the port.

Presence and last-modified of the lock sidecar for cheap freshness MUST surface on
`Spec.persistedStateStamp` from `get()`, not as schema artifact filenames.

## Constraints

- `spec-lock.json` MUST be valid JSON.
- Canonical implementation file identities MUST use forward-slash-normalized `workspace:path` values.
- `symbols`, when present, MUST be non-empty.
- Sidecar maintenance MUST preserve file-level and symbol-level links as distinct archived traceability forms.

## Spec Dependencies

- [`core:spec-id-format`](../spec-id-format/spec.md) — canonical spec ID conventions
- [`core:storage`](../storage/spec.md) — durable sidecar persistence

### Requirement: Sidecar is not a schema artifact

`spec-lock.json` is a persisted semantic sidecar, not a schema-declared spec artifact.

As a consequence:

- it MUST NOT appear in `Spec.artifacts`
- it MUST NOT be accepted by the generic `SpecRepository.artifact()` / `save()` API
- it is read and written only through the repository's persisted-state semantic operations

This keeps the schema artifact surface stable across single-file and multi-file spec
schemas while still allowing persisted dependency and implementation state to exist
next to canonical spec artifacts.
