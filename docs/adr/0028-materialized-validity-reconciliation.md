---
status: accepted
date: 2026-09-22
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0028: Materialized Validity Reconciliation

## Context and Problem Statement

Approval and verification validity used to be inferred by replaying history and by letting several commands invalidate projections on their own. That made current consent depend on event order, let a read migrate or roll a lifecycle backward, and could not tell a stale fingerprint from revoked consent. Verification success was also easy to confuse with a transition into `done`.

We need current validity to be readable from the manifest, one owner for every validity mutation, and reads that do not write.

## Decision Drivers

- **Current state is a projection** — v2 approval and verification status must not be recomputed from history on each read
- **One mutation owner** — artifact review, projection invalidation, audit events, and automatic recovery must not diverge across callers
- **Side-effect-free reads** — loading a manifest, listing changes, and inspecting an archive must not migrate or repair
- **Independent policies** — artifact reopening, workflow recovery, and gate recovery are separate; gates are not configuration
- **Explicit verification** — transitions may check evidence and must not create it
- **Append-only history** — events stay audit evidence and are not compacted or rewritten

## Considered Options

1. **Keep inferring validity by replaying history** — rejected because current status then depends on event order and several callers can still choose different recovery.
2. **Migrate every manifest on read** — rejected because inspection would write, and a failed later command could roll back a recovery that had already been detected.
3. **Let each command invalidate and recover on its own** — rejected because shared helpers do not stop independent callers from diverging.
4. **Capture a verification baseline on entry to `verifying` and complete it from a predicate** — rejected because an attempt is new work, and a check must not record success.
5. **Materialize v2 projections and route every validity mutation through one reconciler** — chosen.

## Decision Outcome

Version 2 manifests store spec approval, sign-off, and verification as materialized projections. History remains append-only. Version 1 is a manifest with no `manifestVersion`. It is adapted in memory only. Any other explicit version throws `UnsupportedManifestVersionError` and writes nothing. A successful mutation of an active change writes version 2. Archive copies the manifest and adds `archivedAt` and `archivedBy` without changing the version.

`ReconcileChangeValidity` is the only application path that applies artifact review, projection invalidation, matching audit events, and automatic lifecycle recovery. Repository `get` does not decide validity and does not migrate. Active status is an application reconciliation and may persist when it discovers invalidity. The same facts do not append a second event.

Automatic recovery uses a separate recovery-only topology. It may return
`signed-off`, `archivable`, or `archiving` to `done`, but those edges are not
user transitions and never appear in `VALID_TRANSITIONS`. Transition and archive
report a committed recovery through `ReconciledOperationBlockedError`; they do
not undo it or reinterpret it as a requested backward hop.

Recovery priority is fixed: required stale or revoked spec approval returns to `designing` when the state is later than `designing`; otherwise required stale or revoked sign-off returns to `done` only when the state is later than `done`; otherwise `workflow: redesign` with unresolved non-task drift returns to `designing`; otherwise the phase is preserved. Recovery never advances an earlier state. Verification staleness never moves the lifecycle. `artifacts: none` waives reopening, not freshness.

New changes default to `{ artifacts: downstream, workflow: preserve }`. A legacy scalar maps to `{ artifacts: <scalar>, workflow: redesign }`. Setting the structured object and the deprecated scalar together is a config error.

`stale` and `revoked` do not heal when the old bytes return. A `null` implementation fingerprint is legacy unknown evidence and cannot authorize a required gate. An empty implementation map is a real observation. Partial fingerprints are `null`. Task artifacts (`hasTasks`) are excluded from fingerprints and from automatic drift. Verification start, complete, and invalidate are state-independent commands. Transitions check evidence and do not create it.

Verification CLI mutations validate their output format (and the invalidate reason) before resolving application context. Structured output is built from an explicit whitelist; aggregates, raw hashes, source content, and unknown runtime fields are never serialized. Start and complete expose no synthetic next action.

Each approval, verification, manual invalidation, or recovery operation resolves
its decorated actor once and reuses that exact identity object for the current
projection and every appended audit event. Archive planning occurs only after
pre-hooks, refreshed implementation tracking, reconciliation, and predicate
rerun, so hook-added accepted links are included in the plan and sidecars.
Renewing spec approval or sign-off replaces only its current materialized
projection and appends an event; legacy pending transitions and all earlier
approval, sign-off, and invalidation events remain untouched.

Repository hydration is observational. It may expose physical artifact facts
such as a hash mismatch as an in-memory status, but it does not persist validity,
recovery, or a manifest-version upgrade. Archive overlap handling likewise sends
an intent to the same reconciler for each peer, so that peer's persisted policy
and enabled gates—not Archive—select blockers and any recovery.

### Consequences

- Good, because current consent is readable without replaying history
- Good, because every validity write shares one recovery decision
- Good, because reads and archive inspection stay side-effect free
- Good, because verification evidence cannot be implied by a lifecycle transition
- Neutral, because active status may write and must read external files
- Bad, because a version 2 manifest is not readable by a version-1-only binary, and mechanical down-conversion would drop projections

### Confirmation

This decision is confirmed when:

- reading a version 1 manifest does not rewrite it, and the next successful active mutation writes version 2 while keeping every prior event
- an explicit unsupported `manifestVersion` exits with `UNSUPPORTED_MANIFEST_VERSION` and writes nothing
- repeating status after the same facts appends no second invalidation or transition
- a required stale spec approval returns to `designing` once, and a stale sign-off already at or before `done` does not move forward
- `workflow: preserve` keeps the current phase for ordinary non-task drift, and `artifacts: none` still reports that drift
- `verification start` and `complete` do not transition, completion rejects a fingerprint mismatch without replacing the baseline, and a second invalidate of stale evidence returns `invalidated: false`
- archive copies version 2 evidence and does not change `manifestVersion`
- verification mutations reject invalid formats before context resolution and structured output contains only whitelisted public fields
- approval renewal and legacy drains retain the exact prior event prefix
- loading drifted files leaves manifest bytes and mtime unchanged
- overlapping preserve peers stay in place with blockers while redesign or required stale spec consent recovers through the central reconciler

## Pros and Cons of the Options

### Keep inferring validity by replaying history

- Good, because no new manifest fields are required
- Bad, because current status depends on event order
- Bad, because callers can still recover differently

### Migrate every manifest on read

- Good, because every subsequent reader would see version 2
- Bad, because inspection would write
- Bad, because a failed command could roll back a recovery that should stay committed

### Let each command invalidate and recover on its own

- Good, because each call site stays local
- Bad, because recovery and projection updates drift apart
- Bad, because a transition can be mistaken for verification success

### Capture a verification baseline on entry to `verifying`

- Good, because evidence would line up with the lifecycle phase
- Bad, because entering the phase is not a decision that verification succeeded
- Bad, because a predicate would record success as a side effect

### Materialize v2 projections and route every validity mutation through one reconciler

- Good, because projections are the v2 source of current validity and history stays audit
- Good, because reads stay side-effect free and recovery has one owner
- Bad, because status is more expensive and version 2 storage is incompatible with a version-1-only reader

## More Information

Rollback is safe only while an older binary will not open a version 2 active manifest. Do not down-convert version 2. Restore the previous binary together with a pre-deployment storage backup, or keep the version-aware reader. There is no eager migration command.

### Spec

- [`core:change`](../../specs/core/change/spec.md)
- [`core:change-manifest`](../../specs/core/change-manifest/spec.md)
- [`core:change-repository-port`](../../specs/core/change-repository-port/spec.md)
- [`core:config`](../../specs/core/config/spec.md)
- [`core:get-status`](../../specs/core/get-status/spec.md)
- [`core:transition-change`](../../specs/core/transition-change/spec.md)
- `core:invalidate-verification` (new spec; not yet under `specs/`)
- `cli:change-verification` (new spec; not yet under `specs/`)
