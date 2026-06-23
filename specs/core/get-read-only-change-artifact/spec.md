# Get Read Only Change Artifact

## Purpose

Studio and HTTP read routes for **drafted**, **discarded**, and (future) **archived** changes must load tracked artifact bytes without exposing a mutable `Change` aggregate to application or delivery layers. `GetReadOnlyChangeArtifact` is the shared use case: it validates against a {@link ReadOnlyChangeView} and loads content through `ChangeRepository.artifactReadOnly`.

## Requirements

### Requirement: GetReadOnlyChangeArtifact returns content and originalHash

For `readOnlyOrigin` `draft` or `discarded`, the use case MUST load the view via `getDraft` or `getDiscarded`, verify the filename is tracked on that view, then call `artifactReadOnly(readOnlyOrigin, name, filename)` and return `{ content, originalHash }` or a typed not-found error.

For `readOnlyOrigin` `archived`, the use case MUST load the archived snapshot via `ArchiveRepository.get(name)`, verify the filename is tracked on that archived read-only view, then load bytes through the archive repository artifact reader and return `{ content, originalHash }`.

### Requirement: GetReadOnlyChangeArtifact does not expose Change

The use case MUST NOT return a `Change` entity and MUST NOT call `mutate`, `mutateDraft`, or `get(name)` for active storage. HTTP handlers and Studio MUST invoke this use case (or the client port equivalent) for `/drafts/*`, `/discarded/*`, and archived artifact body routes — not `GetChangeArtifact`.

### Requirement: GetReadOnlyChangeArtifact enforces tracked-file confinement

The same tracked-file guard as `GetChangeArtifact` MUST apply: untracked filenames MUST fail before `artifactReadOnly` reads disk.

## Spec Dependencies

- [`core:change-repository-port`](../../../../specs/core/change-repository-port/spec.md) — `getDraft`, `getDiscarded`, `artifactReadOnly`
- [`core:read-only-change-view`](../../../../specs/core/read-only-change-view/spec.md) — `ReadOnlyChangeOrigin`, view contract
- [`core:get-draft`](../../../../specs/core/get-draft/spec.md) — drafted view load
- [`core:get-discarded`](../../../../specs/core/get-discarded/spec.md) — discarded view load
- [`core:get-change-artifact`](../get-change-artifact/spec.md) — active-change counterpart
