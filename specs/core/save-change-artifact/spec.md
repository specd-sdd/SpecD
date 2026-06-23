# Save Change Artifact

## Purpose

Studio Save and `PUT` artifact routes must share one pipeline with the CLI: approval guards, optimistic `originalHash`, drift reconciliation, and manifest `updatedAt` bumps. Without a dedicated use case, HTTP handlers would call `saveArtifact` directly and skip invalidation rules agents rely on.

## Requirements

### Requirement: SaveChangeArtifact input shape

The use case MUST accept `name`, `filename`, `content`, `originalHash`, `actor`, and optional `force` defaulting to `false`.

### Requirement: save rejects untracked files and approval-guarded writes

`filename` MUST be tracked on the manifest. When `activeSpecApproval` or `activeSignoff` is set and `force` is false, the use case MUST throw `SaveRequiresForceError` before writing.

### Requirement: optimistic concurrency uses originalHash

When `originalHash` does not match persisted content, the use case MUST throw `ArtifactConflictError` (HTTP 409 at the API boundary).

### Requirement: successful save resets file state and bumps manifest updatedAt

After write, the saved file MUST be `in-progress`, its validated baseline cleared, drift reconciliation MUST run on other files, and `save(change)` MUST set a new manifest `updatedAt`.

### Requirement: SaveChangeArtifact returns hash revision and invalidation flag

The result MUST include `{ contentHash, updatedAt, invalidated: boolean }`.

## Spec Dependencies

- [`core:change-repository-port`](../change-repository-port/spec.md) — repository
- [`core:change`](../change/spec.md) — entity
