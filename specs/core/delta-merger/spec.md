# Delta Merger

## Overview

`mergeSpecs` is a pure function in `@specd/core/domain/services/` that applies a delta spec to a base spec, producing a new merged `Spec`. It is schema-driven: section names, block header patterns, and operation keywords all come from the caller — nothing is hardcoded. The full behavioral contract (operations, order, conflict rules) is defined in `specs/_global/schema-format/spec.md`; this spec covers the TypeScript interface and implementation requirements.

## Requirements

### Requirement: Function signature

`mergeSpecs` must have the following signature:

```typescript
export function mergeSpecs(
  base: Spec,
  delta: Spec,
  deltaConfigs: readonly DeltaConfig[],
  deltaOperations?: OperationKeywords,
): Spec
```

`DeltaConfig` defines the section name and block header pattern for one delta section. `OperationKeywords` carries the six configurable keyword labels (`added`, `modified`, `removed`, `renamed`, `from`, `to`). When `deltaOperations` is omitted, specd defaults apply (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`, `FROM`, `TO`).

```typescript
export interface DeltaConfig {
  readonly section: string
  readonly pattern: string
}

export interface OperationKeywords {
  readonly added: string
  readonly modified: string
  readonly removed: string
  readonly renamed: string
  readonly from: string
  readonly to: string
}
```

### Requirement: Apply order

Operations are applied in fixed order — **RENAMED → REMOVED → MODIFIED → ADDED** — across all `deltaConfigs`. Each config is processed independently. See `specs/_global/schema-format/spec.md` — Requirement: Delta merge operations for the full behavioral contract.

### Requirement: Conflict detection

`mergeSpecs` must run conflict detection before applying any changes. If any conflict is found, it must throw a `DeltaConflictError` without modifying the base spec. See `specs/_global/schema-format/spec.md` — Requirement: Delta conflict detection for the full list of conflict conditions.

### Requirement: Pure function

`mergeSpecs` must be a pure function — it must not mutate `base` or `delta`, it must not perform any I/O, and calling it twice with the same inputs must produce equal outputs.

## Constraints

- `mergeSpecs` must not hardcode any operation keyword — all keywords come from `deltaOperations` (with defaults as fallback)
- `DeltaConflictError` must be a typed subclass of `SpecdError` with a machine-readable `code`
- Block order in the merged spec is preserved from the original; ADDED blocks are appended after all existing blocks
- `{name}` in `DeltaConfig.pattern` is expanded to `.+` for regex matching — see `specs/_global/schema-format/spec.md` — Requirement: Pattern matching

## Spec Dependencies

- [`specs/_global/schema-format/spec.md`](../../_global/schema-format/spec.md) — full behavioral contract for delta operations, conflict detection, and pattern matching
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — pure function requirement for domain services

## ADRs

_none_
