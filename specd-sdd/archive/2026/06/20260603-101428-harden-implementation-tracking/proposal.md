# Proposal: harden-implementation-tracking

## Motivation

The current implementation tracking system is fragile when dealing with non-existent or temporary files, and the first implementation pass left several repository and spec contracts out of sync. This change needs to harden the `removed`-file flow and also reconcile the surrounding specs and repository behavior so implementation tracking, manifest persistence, and CLI review semantics all agree.

## Current behaviour

- Implementation tracking now models `removed`, but dependent specs and repository contracts do not all describe that state consistently yet.
- `specd changes implementation resolve` can still move files into `resolved` in cases the scoped CLI spec does not permit, including paths that were never reopened through refresh.
- `specd changes implementation ignore` still rejects files with live links even though the scoped behavior is now a tracked-state transition, not a link rewrite.
- The stale-symbol fallback used by implementation review does not enforce the graph-reported symbol kind, so it can clear stale diagnostics on the wrong symbol.
- `FsChangeRepository.saveArtifact()` does not downgrade artifact status back to `in-progress` after writes, and `artifactExists()` still collapses confinement violations into a plain `false`.
- Internal `specd` directories (`changes/`, `drafts/`, `archive/`, `discarded/`) must remain excluded from discovery, and the repository-base spec still omits the `configPath` constructor field already required by the code.

## Proposed solution

1.  **Keep `removed` as a first-class tracked state**: Preserve the new lifecycle for deleted implementation files, including refresh-driven resurrection back to `open`.
2.  **Enforce review-state transitions in Core**: Tighten `resolve`, `ignore`, and `unresolve` semantics in `UpdateImplementationTracking` so they match the scoped CLI spec exactly.
3.  **Preserve repository invariants**: Fix `saveArtifact()` state downgrade behavior and make tracked-artifact existence checks preserve confinement and tracked-file contract errors instead of hiding them.
4.  **Correct stale-symbol review fallback**: Require the same-file fallback used by implementation review to respect the graph-reported symbol kind before clearing a stale diagnostic.
5.  **Reconcile spec dependencies and base contracts**: Update the affected spec deltas plus dependent specs (`core:change` and `core:repository-port`) so `removed` state support, `configPath`, and schema-mismatch semantics are internally consistent.
6.  **Keep internal-directory filtering**: Continue excluding internal `specd` management directories from implementation discovery at the detector and repository levels.

## Specs affected

### New specs

- none

### Modified specs

- `core:refresh-implementation-tracking`: Add logic to detect deleted files, transition them to `removed`, and cleanup associated links.
  - Depends on (added): `core:archive-repository-port`
  - Depends on (removed): none
- `core:change-manifest`: Update the `trackedImplementationFiles` schema to include the `removed` state.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-implementation`: Update subcommands (`list`, `resolve`, `ignore`, `unresolve`) to handle the `removed` state, constrain reopen/resolve behavior, and require kind-aware stale-symbol fallback.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change-repository-port`: Define internal directory exclusion rules for implementation discovery, preserve artifact confinement semantics, and require `saveArtifact()` to reset artifact state after writes.
  - Depends on (added): none
  - Depends on (removed): none
- `core:archive-repository-port`: Add `internalPaths()` method for directory exclusion.
  - Depends on (added): none
  - Depends on (removed): none
- `core:implementation-detector-port`: Extend the detector contract so refresh can pass exclusion paths without binding itself to backend-specific filtering behavior.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change`: Align the tracked implementation state model with the new `removed` review state and the refresh-driven resurrection flow.
  - Depends on (added): none
  - Depends on (removed): none
- `core:repository-port`: Update the shared repository base contract so `RepositoryConfig` includes the already-required `configPath` construction field.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Domain Model**: `TrackedImplementationFileState` will have a new member.
- **Persistence**: `manifest.json` will store the new `removed` state.
- **CLI Output**: `specd changes implementation list` and `status` will display removed files, and stale-symbol review becomes stricter.
- **Repository Contracts**: `RepositoryConfig`, `saveArtifact()`, and artifact existence checks will be brought back into alignment with their specs.
- **Traceability**: Implementation links will be more robust against file deletions and false-positive stale-symbol recovery.

## Technical context

- The `removed` state should be treated as a terminal review state for the current change cycle, similar to `ignored`.
- **ImplementationLink** cleanup must be handled during the `RefreshImplementationTracking` mutation to ensure atomicity.
- **Specd directory filtering**: The `ChangeRepository` and `ArchiveRepository` ports will expose an `internalPaths()` method. Filesystem-backed implementations will return their absolute storage paths (e.g., `changes/`, `drafts/`, `archive/`). The `RefreshImplementationTracking` use case will collect these paths, normalize them to project-relative, and pass them to the `ImplementationDetector` to ensure internal metadata and archived files are never tracked as implementation.
- Filtering in `VcsImplementationDetector` will use patterns consistent with `code-graph` discovery, rejecting any path that starts with or matches one of the internal directories.
- `resolve` and `unresolve` are only valid for files that are physically present and in a review state the workflow allows; refresh remains the only path that resurrects a `removed` file.
- `ignore` is a tracked-file state transition and must not require prior link deletion.
- The repository base contract already includes `configPath` in code, so the dependency spec must be updated instead of leaving downstream ports to depend on undocumented constructor data.
- Refresh must treat tracked-file existence as a manifest integrity concern, not just an `open`-review concern. That means every non-ignored tracked file, including `resolved` and previously `removed` entries, participates in the existence pass so deletion and resurrection are both detected deterministically.
- Explicit untracking remains a separate concern from review-state transitions. Existing remove/untrack behavior continues to be the escape hatch for deleting an entry from tracking entirely, while `ignore` and `removed` preserve the historical record inside the manifest.
- Manual reopening is distinct from refresh-driven resurrection. `unresolve` is an explicit operator action that forces an existing tracked file back to `open` without altering confirmed implementation links. Files that do not exist on disk are not eligible for `unresolve`; they stay in the `removed` flow instead.
- Application-layer existence checks must stay inside the port boundary. The refresh use case will rely on the existing `FileReader` port plus the absolute `projectRoot` injected at composition time, rather than importing `fs` directly into application code.

## Open questions

- none at this stage
