# Proposal: Directional artifact invalidation

## Motivation

When any artifact file drifts (content changes on disk), `change.invalidate()` resets ALL artifacts in the change — including upstream dependencies that haven't changed. This forces full re-validation of the entire DAG even when only one artifact was modified. For example, editing `tasks.md` invalidates `specs`, `verify`, and `proposal` even though none of them changed.

## Current behaviour

`Change.invalidate()` calls `artifact.resetValidation()` on every artifact in the change unconditionally. This is called from two places:

1. `FsChangeRepository.get()` — auto-invalidation when a file drifts on disk
2. `ValidateArtifacts.execute()` — when artifact content differs from approval hashes

Both cases reset all artifacts and transition the change back to `designing`, requiring re-validation of the entire DAG from the root.

## Proposed solution

1. Add a `resetArtifactValidations(artifactIds)` method to `Change` that only resets the specified artifacts (not all of them). This is distinct from `clearArtifactValidations` (which exists for `verifying → implementing`) — it resets by walking downstream from the drifted artifacts.

2. In `FsChangeRepository.get()`, when drift is detected, collect the drifted artifact type IDs, compute their downstream dependents in the DAG, and only reset those — leaving upstream artifacts intact. The `invalidate()` call (which handles approval revocation and state transition) still happens globally.

3. In `ValidateArtifacts.execute()`, when approval invalidation is triggered, apply the same selective reset — only reset the artifact whose hash changed plus its downstream dependents.

4. The `invalidate()` method on `Change` is split into two concerns:
   - **Approval revocation + state transition** — always global (correct behaviour)
   - **Artifact validation reset** — now selective, based on which artifacts actually drifted

## Specs affected

### New specs

None.

### Modified specs

- `core:core/change`: Add `resetDownstreamValidations(driftedIds)` method. Modify `invalidate()` to accept an optional set of drifted artifact IDs — when provided, only reset those + their downstream dependents instead of all artifacts.
- `core:core/change-repository-port`: Update auto-invalidation requirement to pass drifted artifact IDs to `invalidate()`.
- `core:core/validate-artifacts`: Update approval invalidation to pass drifted artifact IDs to `invalidate()`.

## Impact

- **Entity** (`change.ts`): modify `invalidate()` to accept optional `driftedArtifactIds` parameter.
- **Infrastructure** (`change-repository.ts`): collect drifted IDs before calling `invalidate()`.
- **Use case** (`validate-artifacts.ts`): collect drifted IDs before calling `invalidate()`.
- **No breaking changes**: when `driftedArtifactIds` is not provided, `invalidate()` falls back to resetting all (backward compatible).

## Open questions

None.
