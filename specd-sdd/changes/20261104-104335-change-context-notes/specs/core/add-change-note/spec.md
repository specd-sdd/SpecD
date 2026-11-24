# Add Change Note

## Purpose

Explicit note creation must use the same invariants and atomic persistence as automatic producers. AddChangeNote adds or reuses an autonomous current note without changing lifecycle or validity.

## Requirements

### Requirement: Validated input before effects

execute SHALL accept name, text and optional autoRemove, reject unknown fields and validate all input before reconciliation, refresh, actor resolution or persistence. Text SHALL be trimmed externally and non-blank, permit multiline content with no arbitrary 500-character cap, and preserve internal whitespace. The policy SHALL satisfy core:note-auto-removal-policy. Identity/time supplied by callers as note fields MUST be rejected.

### Requirement: Atomic add and deduplication

The use case SHALL resolve the decorated operation actor and use serialized ChangeRepository.mutate. The aggregate SHALL compare trimmed text, author and policy against current notes. Matching input SHALL return the existing note unchanged with no new note-added event or note-only updatedAt change. Otherwise generate a UUID v4 and timestamp through application dependencies and append the note and note-added audit atomically. Comparison SHALL use actor IDs when both exist, otherwise the canonical persisted-field SHA-256 fallback excluding id; policy equality follows its own spec.

### Requirement: Active-only autonomous state

Notes SHALL have no origin links, occurrence keys, fingerprints or dependencies on source problems. Add MUST NOT change lifecycle, approvals, verification or artifact validity. A removed note can be created again by a later request. Unknown/non-active names SHALL fail through the active repository contract. Failed persistence SHALL not leave partial notes or audit.

### Requirement: Composition and result

Expose typed input/result/dependencies, public createAddChangeNote factories using the existing resolver and Kernel.changes.addNote. The result SHALL identify the returned note and whether it was created or reused. No fs adapters SHALL enter domain logic.

## Spec Dependencies

- `core:change` — shared domain, application or adapter contract used by this capability.
- `core:note-auto-removal-policy` — shared domain, application or adapter contract used by this capability.
- `core:change-repository-port` — shared domain, application or adapter contract used by this capability.
- `core:actor-resolver-port` — shared domain, application or adapter contract used by this capability.
- `default:_global/architecture` — shared domain, application or adapter contract used by this capability.
