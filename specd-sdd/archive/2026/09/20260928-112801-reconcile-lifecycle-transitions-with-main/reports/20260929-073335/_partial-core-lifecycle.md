# Delegated compliance audit — core lifecycle

Change: `reconcile-lifecycle-transitions-with-main`  
Verification attempt: `verification-attempt-1` (owned by the outer verifier)  
Scope: `core:hook-execution-model`, `core:change`, `core:transition-change`, `core:run-step-hooks`, `core:change-manifest`

## Requirements Summary

The merged previews define 96 requirements and 266 explicit verification scenarios:

| Spec                        | Requirements | Scenarios | Result     |
| --------------------------- | -----------: | --------: | ---------- |
| `core:hook-execution-model` |           12 |        41 | Conformant |
| `core:change`               |           30 |       102 | Conformant |
| `core:transition-change`    |           29 |        69 | Conformant |
| `core:run-step-hooks`       |           16 |        31 | Conformant |
| `core:change-manifest`      |            9 |        23 | Conformant |

The audited contracts cover hook entry forms and dispatch, phase/failure policy, lifecycle and approval semantics, implementation tracking, validity projections, state-independent verification attempts, transition orchestration, manifest v2 compatibility, deterministic fingerprints, tracked filename normalization, and atomic persistence.

## Implementation Status

### `core:hook-execution-model`

**Implemented.** `RunStepHooks` filters executable entries to `run` and `external`, leaving `instruction` passive (`packages/core/src/application/use-cases/run-step-hooks.ts:209-216`). External hooks are dispatched through the accepted-type runner map and unknown types use a typed error (`run-step-hooks.ts:301+`). Shell hooks receive developer text unchanged and a constrained template variable map; archived hooks add `archivedName` but neither active nor archived paths derive a singular workspace (`run-step-hooks.ts:146-152,196-199`). Pre failures stop the loop while post failures accumulate (`run-step-hooks.ts:227-291`).

Transition hook behavior is binding-driven: `TransitionChange` evaluates predicates first, selects `matchingEffects`, passes skip selectors through the shared execution context, and persists only after before-persist effects succeed (`packages/core/src/application/use-cases/transition-change.ts:234-344`). This matches the merged requirement that source post and target pre effects execute before persistence, use binding `onFailure`, and are not launched by check id. Archive behavior is covered by the direct dependency and its focused tests.

Host-shell quote translation and verbatim substitution are implemented at the `HookRunner` boundary (`packages/core/src/infrastructure/node/hook-runner.ts`) and exercised independently.

### `core:change`

**Implemented.** The entity owns immutable identity, canonicalized spec scope, derived workspaces, lifecycle history, implementation tracking, approval/signoff/verification projections, artifact state, invalidation evidence, and archive failure history (`packages/core/src/domain/entities/change.ts`). The implementation tracking timestamp is historical rather than state-derived (`change.ts:598-614,728-734`), entering implementing activates it (`change.ts:915-926`), and verification attempt start/completion are explicit operations independent of lifecycle transitions (`change.ts:1320-1410`). Spec IDs are deduplicated and workspace identity is derived from them rather than persisted as a primary workspace (`change.ts:461,545-556`).

No layer violation was found: domain behavior remains pure, while dependency-aware lifecycle interpretation, reconciliation, storage and hook execution remain in domain services/application/infrastructure respectively.

### `core:transition-change`

**Implemented.** The use case performs canonical validity reconciliation before requested-edge evaluation, optionally refreshes tracking, resolves `next` through the domain happy path, evaluates the shared predicate registry, maps typed failures, executes matching effects, rechecks readiness where required, mutates through the repository serialization boundary, and emits progress (`packages/core/src/application/use-cases/transition-change.ts`). Approval gates are constructor configuration, not mutable execution flags. `skipHookPhases` affects effects only, and `allowOutOfScope` remains explicit. Verification evidence is checked but neither started nor completed by a transition.

The implementation delegates lifecycle legality to the entity and check semantics to composed bindings; it does not recreate a private lifecycle table. The persisted transition occurs after successful effect execution (`transition-change.ts:284-344`).

### `core:run-step-hooks`

**Implemented.** Constructor ports, active/archive lookup, schema-name guard, valid-state resolution, executable hook collection, `--only` behavior, progress relay, external dispatch, variables, failure policy and result aggregation are all present in `packages/core/src/application/use-cases/run-step-hooks.ts`. Composition factories and accepted-type indexing are present in the composition layer (`packages/core/src/composition/use-cases/run-step-hooks.ts`, `packages/core/src/composition/composition-registries.ts:137-150`).

### `core:change-manifest`

**Implemented.** `FsChangeRepository` writes manifest version 2, serializes projections and append-only events, adapts legacy manifests conservatively, rejects unsupported future versions, normalizes implementation paths and tracked artifact filenames under representation-preserving rules, and uses `writeFileAtomic` (`packages/core/src/infrastructure/fs/change-repository.ts:69,1302+,1668,1845-1880`). Verification attempt/completion events are explicitly serialized, lifecycle remains history-derived, and the manifest does not persist a top-level lifecycle state.

The repository keeps `manifestVersion`, current projections and historical evidence distinct. Its tests cover legacy no-version reads without eager migration, unsupported future versions, scope-bearing approval fingerprints, archive failure history, direct/delta filename decisions, normalization guards and atomic writes.

## Discrepancies

No blocking, major, minor, or informational spec/implementation discrepancy was found in the assigned scope.

| Severity | Count | Evidence                                                   |
| -------- | ----: | ---------------------------------------------------------- |
| Critical |     0 | No safety, persistence, or lifecycle contradiction found   |
| High     |     0 | Predicate/effect timing and verification ownership conform |
| Medium   |     0 | Manifest compatibility and projection semantics conform    |
| Low      |     0 | No undocumented observable mismatch found                  |

The merged change specs are also semantically compatible with the inspected global and direct dependency specs. In particular:

- `default:_global/architecture` agrees with the domain/application/infrastructure split and manual dependency injection.
- `core:transition-checks` agrees that hooks are effects selected by `from`/`to`/`along`, with phase and failure policy supplied by bindings.
- `core:workflow-model` and `core:lifecycle-engine` agree on domain lifecycle states, requires gating, happy-path resolution and centralized lifecycle verdicts.
- `core:schema-format`, `core:external-hook-runner-port`, `core:hook-runner-port` and `core:template-variables` agree on the three exclusive hook forms, accepted-type dispatch, shell-only `HookRunner`, verbatim substitution and absence of a singular change workspace token.
- `core:change-layout`, `core:storage` and `core:spec-id-format` agree on canonical workspace-qualified artifact paths, authoritative tracked filenames, confinement and manifest persistence.
- `core:refresh-implementation-tracking`, `core:implementation-detector-port` and `core:count-tasks` agree on orchestration boundaries and do not leak detection/counting into the entity.

## Test Coverage

Focused execution completed successfully:

```text
Test Files  7 passed (7)
Tests       385 passed (385)
Duration    7.18s
```

Executed files:

- `packages/core/test/application/use-cases/transition-change.spec.ts` — 95 declared tests plus parameterized cases; transition predicates/effects, approvals, reconciliation, hooks, retry/redesign, tracking and verification evidence.
- `packages/core/test/application/use-cases/run-step-hooks.spec.ts` — 33 declared tests; lookup, filtering, external runners, progress, template variables and fail-fast/fail-soft behavior.
- `packages/core/test/domain/entities/change.spec.ts` — 116 declared tests; lifecycle, events, artifacts, tracking, approvals and verification projections.
- `packages/core/test/infrastructure/fs/change-repository.spec.ts` — 108 declared tests; manifest structure, compatibility, filename representation, round trips and atomic persistence.
- `packages/core/test/infrastructure/node/hook-runner.spec.ts` — 14 declared tests; verbatim expansion and host quote normalization.
- `packages/core/test/infrastructure/node/hook-runner-spawn.spec.ts` — 4 declared tests; process execution behavior.
- `packages/core/test/composition/use-cases/transition-change.spec.ts` — 4 declared tests; config/resolver wiring.

Representative direct evidence includes transition source-post ordering/failure tests around `transition-change.spec.ts:1447-1610`, skip selector and recovery tests around `:1783-1835` and `:2555+`, verification non-manufacture/preservation tests around `:2901-2985`, external dispatch tests at `run-step-hooks.spec.ts:196-248`, workspace exclusion at `:685-712`, verification attempt history at `change.spec.ts:1658-1729`, and manifest v2/legacy/future-version coverage at `change-repository.spec.ts:2848-2965`.

## Missing Tests

No required scenario was found without an implementation-level test surface. Several merged scenarios intentionally map to the same parameterized or cross-spec test (for example hook timing is asserted by both the hook model and transition specs); this is reuse, not a coverage gap.

No additional test is required before completing the delegated compliance audit for this batch.

## Spec Dependency Chain

Direct dependencies were loaded to depth 1 and reviewed for contradiction:

- Hook model: `core:workflow-model`, `core:schema-format`, `core:hook-runner-port`, `core:transition-change`, `core:archive-change`, `core:run-step-hooks`, `core:get-hook-instructions`, `core:config`, `cli:change-transition`, `cli:change-archive`, `core:transition-checks`.
- Change entity: `core:change-manifest`, `core:workflow-model`, `core:spec-metadata`, `core:spec-id-format`, `default:_global/architecture`, `core:lifecycle-engine`, `default:_global/logging`, `core:implementation-detector-port`, `core:transition-checks`.
- Transition: `core:change`, `core:run-step-hooks`, `core:hook-execution-model`, `core:workflow-model`, `default:_global/architecture`, `core:lifecycle-engine`, `core:refresh-implementation-tracking`, `core:composition-resolver`, `core:count-tasks`, `core:transition-checks`.
- Run-step hooks: `core:hook-execution-model`, `core:hook-runner-port`, `core:external-hook-runner-port`, `core:schema-format`, `core:config`, `core:change`, `core:template-variables`, `core:archive-repository-port`, `core:composition-resolver`.
- Manifest: `core:change`, `core:change-layout`, `core:storage`, `core:spec-metadata`, `core:spec-id-format`, `core:workspace`.

Dependency result: **0 contradictions**. The graph was current at commit `a5ecfed1` (`stale: false`, `fingerprintMismatch: false`, 1,288 indexed files, 49,990 symbols, 293 specs, zero parse failures).

## Numeric Summary

- Specs audited: **5**
- Requirements reviewed: **96**
- Verification scenarios reviewed: **266**
- Direct dependency specs reviewed (unique): **24**
- Focused test files passed: **7/7**
- Focused tests passed: **385/385**
- Critical findings: **0**
- High findings: **0**
- Medium findings: **0**
- Low findings: **0**
- Missing-test findings: **0**
- Compliance verdict: **PASS**
