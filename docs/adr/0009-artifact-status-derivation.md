# ADR-0009: Artifact Status Derivation — Hash-Based, Not Stored

## Status
Accepted

## Context
Each artifact in a change has a lifecycle status: `missing`, `in-progress`, or `complete`. This status needs to reflect the current state of the file on disk, not just what was last written to a manifest.

Two approaches were considered for managing status:

**Stored status:** the manifest records the current status explicitly. The agent or use case calls explicit mutation methods (`markInProgress()`, `markComplete()`) to update it. Simple to implement, but fragile — any out-of-band edit to the artifact file (human edit, another agent session, tool write) leaves the stored status stale with no detection.

**Derived status:** the manifest stores only the `validatedHash` (SHA-256 of the file content at the moment it last passed validation). Status is recomputed on every load by comparing the current file hash against the stored hash. An out-of-band edit is automatically detected as a hash mismatch and the artifact drops back to `in-progress`.

Additionally, artifacts can declare dependencies on other artifacts via `requires` (populated from the schema). An artifact cannot be `complete` if any of its dependencies are not `complete` — even if its own file and hash are unchanged. This cascade must be computed across the full artifact graph, not per artifact in isolation.

## Decision

`Artifact` stores `validatedHash` in the manifest but not the status. Status is derived at load time by `FsChangeRepository`:

- File does not exist → `missing`
- File exists, no `validatedHash` or current hash ≠ `validatedHash` → `in-progress`
- Hash matches → `complete` candidate (subject to dependency cascade)

`Change.effectiveStatus(type)` applies the dependency cascade: if any artifact in the `requires` chain is not `complete`, the artifact's effective status is `in-progress` regardless of its own hash.

`markComplete(hash: string)` is the only mutating method on `Artifact`. It is called exclusively by the `ValidateSpec` use case after successful structural validation. There is no `markInProgress()` — that status is derived, not set.

## Consequences
- Out-of-band file edits (human, another agent, any tool) are automatically detected on next load — no explicit drift notification required
- The manifest is minimal — one hash per artifact, nothing else for status
- `ValidateSpec` is the single gate for `complete` status — no other path can mark an artifact complete
- Dependency cascade means modifying an upstream artifact automatically invalidates all downstream artifacts that depended on it
- `FsChangeRepository` must hash artifact files on every load; this is a filesystem read per artifact, acceptable for the typical change size (3–6 artifacts)

## Spec

- [`specs/_global/storage/spec.md`](../../specs/_global/storage/spec.md)
