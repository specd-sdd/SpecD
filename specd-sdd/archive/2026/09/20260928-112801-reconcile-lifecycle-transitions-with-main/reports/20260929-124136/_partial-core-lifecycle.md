# Compliance audit — core lifecycle and CLI transition

Delegated verification attempt: `verification-attempt-2`

## Scope and method

- Change: `reconcile-lifecycle-transitions-with-main`
- Merged specs audited: `core:hook-execution-model`, `core:change`, `core:change-manifest`, `core:transition-change`, `core:run-step-hooks`, `core:change-repository-port`, `cli:change-transition`
- Scope size: 140 requirements and 393 verification scenarios.
- The merged view for every spec was obtained with `changes spec-preview`; raw deltas were not treated as the final contract.
- Graph freshness was checked first (`stale: false`, complete coverage). Graph search and spec impact were used to identify the implementation and test surfaces. All seven specs have CRITICAL transitive impact, so the audit covered domain, application, composition, filesystem persistence, hook infrastructure, and CLI presentation boundaries.
- Binding project constraints reviewed: hexagonal ownership, strict TypeScript/ESM conventions, actionable error handling, cross-platform testing, and Vitest test separation. Direct dependency contracts were also checked, particularly lifecycle-engine/transition-checks, schema-format/workflow-model, hook runner ports, storage/change-layout, repository base, GetStatus, and CLI entrypoint conventions.

## Requirements summary

| Spec                          | Requirements | Scenarios | Status        |
| ----------------------------- | -----------: | --------: | ------------- |
| `core:hook-execution-model`   |           12 |        41 | Compliant     |
| `core:change`                 |           30 |       103 | Compliant     |
| `core:change-manifest`        |            9 |        23 | Compliant     |
| `core:transition-change`      |           29 |        69 | Compliant     |
| `core:run-step-hooks`         |           16 |        31 | Compliant     |
| `core:change-repository-port` |           29 |        78 | Compliant     |
| `cli:change-transition`       |           15 |        48 | Compliant     |
| **Total**                     |      **140** |   **393** | **Compliant** |

## Implementation status and coverage

### `core:hook-execution-model`

The three hook forms, passive instruction behavior, explicit external dispatch, binding-driven phase/failure policy, skip selectors, ordering, and template expansion are implemented across `RunStepHooks`, transition/archive effect checks, schema validation, the node hook runner, and composition wiring. Transition effects execute before persistence with abort semantics; archive post effects collect after persistence. Instruction hooks are excluded from runtime execution and external hooks require a compatible registered runner. Tests cover shell/external/instruction discrimination, accepted-type selection and missing-runner errors, pre fail-fast and post fail-soft behavior, source-post/target-pre ordering, redesign/backward filtering, archive timing, template variables and host quote translation.

### `core:change`

The entity and supporting domain services implement identity and Windows-name guards, immutable spec/workspace-derived scope, the canonical lifecycle graph and drain-only parked states, neutral designing self-entry at the use-case boundary, approval/signoff projections, state-independent verification attempts, artifact/file drift, append-only history, implementation tracking, drafting/discarding, archive outcomes, schema-version history, task scope, and validity fingerprints. Lifecycle interpretation and dependency-aware reconciliation remain outside the entity, preserving the architecture contract. Domain and use-case tests cover the merged scenarios, including scope-aware consent, stale/current verification, exact invalidation projections, per-file drift, removed/resurrected tracked files, historical implementation guards, archive recovery, and task-artifact exclusion.

### `core:change-manifest`

Manifest serialization preserves native-v2 projections, legacy-v1 adaptation, strict future-version rejection, scoped approvals, verification attempt events, invalidation detail, filenames and tracked representation intent, fingerprints, and archive-failure history. Filesystem persistence uses serialized mutation and atomic manifest publication; normalization refuses representation-changing rewrites. Repository/loader tests exercise v1/v2 compatibility, round trips, future versions, filenames, fingerprints, attempt auditability, and atomic history persistence.

### `core:transition-change`

`TransitionChange` owns refresh/reconciliation/check/effect/persistence orchestration without manufacturing verification evidence. Approval policy is fixed at construction, pending states remain repair/drain paths, `to: 'next'` is resolved in Core, workflow and task requirements are predicates, implementation tracking activates on entry, and effect execution is selected by binding semantics. State persistence is serialized through repository mutation. Tests cover missing/schema errors, every relevant lifecycle direction, approval gates, canonical recovery, task/requires failures, hook ordering/failure/skip behavior, progress events, redesign/backward invalidation, post-hook refresh, implementation tracking checks, verification evidence preservation, and composition dependency resolution.

### `core:run-step-hooks`

The shared engine loads active or archived changes as specified, validates schema identity and step names, collects schema/project hooks in stable order, excludes instruction hooks, dispatches shell and explicit external hooks, supports `only`, constructs variables without singular workspace semantics, relays output/heartbeat progress, and returns complete fail-fast/fail-soft result shapes. Unit and infrastructure tests cover every requirement, including archived post fallback and progress before failure.

### `core:change-repository-port`

The port and filesystem adapter conform to the repository abstraction and read-model separation. Serialized `mutate`/`mutateDraft` windows prevent partial writes, hydrate fresh facts without deciding validity, reject wrong storage buckets, preserve ordering and cached list projections, enforce optimistic concurrency and tracked-file/path confinement, expose storage paths appropriately, and implement scaffold/unscaffold/delete/reindex contracts. The filesystem repository and manifest loader suites cover active/draft/discarded separation, mutation serialization/rollback, future manifest rejection, drift hydration, list buckets/counts, artifact confinement, concurrency, path access, and cleanup behavior.

### `cli:change-transition`

The CLI delegates lifecycle resolution and refresh policy to Core, parses explicit/`--next` targets and skip selectors, omits approval overrides, reports canonical blockers/next actions, preserves the transition progress stream boundary, maps hook failures to exit code 2 without a repair guide, and emits stable text/structured terminal results. CLI tests cover argument errors, all gate and parked-state routes, forwarding semantics, repair guidance, incomplete tasks, hook progress/liveness/history, structured stream records, skip selectors, and failure visibility.

## Test evidence

- Focused domain/application/repository/CLI batch: **9 files, 445 tests passed**.
- Expanded hook/archive/infrastructure/presentation batch: **7 files, 143 tests passed**.
- Combined audit evidence: **16 test files, 588 tests passed, 0 failed**.
- The selected tests include real temporary-filesystem integration coverage for persistence and infrastructure-level hook runner coverage, consistent with the global testing contract.

## Discrepancies

No implementation/spec discrepancy was found in this batch. No contradictory requirement was found between the merged change specs, their direct dependencies, or the applicable global constraints.

## Missing or insufficient tests

None identified. Each requirement has direct scenario coverage or is an architectural/typing constraint exercised through its owning implementation and integration tests. The previously relevant hook, lifecycle, manifest, repository, transition, and progress boundaries all have executable evidence.

## Spec dependency chain

- Hook semantics flow from `schema-format`, `workflow-model`, hook runner ports, and `transition-checks` into `run-step-hooks`, transition/archive effects, and CLI commands.
- Lifecycle state and persisted projections flow from `change` into `change-manifest`, `change-repository-port`, `lifecycle-engine`, `transition-change`, status, and CLI presentation.
- Repository behavior conforms to `repository-port`, `storage`, `change-layout`, read-only views, and the manifest contract.
- CLI transition behavior conforms to Core transition/status outputs and does not duplicate lifecycle interpretation.
- No dependency inversion or Core-to-adapter coupling violation was observed.

## Summary counts

- Specs audited: **7**
- Requirements audited: **140**
- Scenarios reviewed: **393**
- Compliant requirements: **140**
- Partial requirements: **0**
- Non-compliant requirements: **0**
- Discrepancies: **0**
- Missing-test findings: **0**
- Advisory findings: **0**
