# Specification compliance audit

**Change:** `lifecycle-polish-followups`  
**Mode:** change-scoped, merged-spec audit  
**Date:** 2026-09-19  
**Graph:** current and content-fresh

## Executive summary

The implementation is conformant for all reviewed runtime behavior. The historic parked-approval failure now preserves `approval-required`; lifecycle blocker identity, CLI status fallback, archive snapshot reuse, fast-track wording, plugin metadata-extraction rejection, its user documentation, and the schema-resolution blocker are all implemented and covered.

Three P2 specification-replacement gaps remain. They are retained base-contract clauses which contradict the intended corrected requirements in the merged previews; no runtime code change is indicated. Two P3 end-to-end test hardening opportunities also remain.

| Severity | Count | Disposition                                       |
| -------- | ----: | ------------------------------------------------- |
| P0       |     0 | None                                              |
| P1       |     0 | None                                              |
| P2       |     3 | Replace stale clauses in the relevant spec deltas |
| P3       |     2 | Optional coverage follow-ups                      |

## Required follow-up findings

1. **P2 — Hook forms:** replace the retained `exactly two types` / `instruction`-or-`run` clauses in `core:hook-execution-model` and `core:schema-format` with the definitive three-form contract: `instruction:`, `run:`, and `external:`.
2. **P2 — Schema plugin extraction:** remove `metadataExtraction` from the retained schema-plugin `MAY` list in `core:schema-format`. The parser, test, ADR, and both user documentation pages already correctly prohibit it.
3. **P2 — GetStatus degradation:** replace the retained silent/empty-blocker requirement with the read-only `SCHEMA_RESOLUTION_FAILED` contract.

## Validation evidence

- `pnpm test`: passed (14 Turbo tasks; core, CLI, and code-graph test suites).
- `pnpm lint`: passed.
- Focused core runtime audit tests: 127 passed.
- Focused new schema/GetStatus tests: 92 passed.
- `pnpm typecheck`: emitted `TypeScript: No errors found` but exited 1 under the repository/RTK invocation; this needs separate tooling diagnosis if a green root typecheck exit is required. It did not report a TypeScript diagnostic.

## Detailed findings

The following partial reports are retained verbatim for traceability.

### Core hygiene

<details>
<summary>Open complete partial report</summary>

See [\_partial-core-hygiene.md](_partial-core-hygiene.md).

</details>
\n+## Complete partial reports (verbatim)\n+
+# Fresh compliance audit partial — core hygiene specifications

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, `core:config-writer-port`  
**Method:** read-only, change-scoped audit of merged `spec-preview` content, production source, tests, user documentation, direct dependencies, and global architecture rules.  
**Graph:** current at `2026-09-19T10:36:14.237Z`; no stale/fingerprint mismatch.

## Requirements summary

| Spec                        | Change-scoped requirement                                                                                  | Implementation/test status                                        | Compliance status                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `core:hook-execution-model` | Exactly three entry forms: `instruction:`, `run:`, `external:`.                                            | Parser, `HookEntry`, dispatch, and tests support all three.       | **P2 internal spec inconsistency remains.** |
| `core:schema-format`        | A plugin must not declare/mutate `metadataExtraction`; transforms/resolved layers remain extension points. | Parser rejects the declaration; focused test and user docs exist. | **P2 internal spec inconsistency remains.** |
| `core:change`               | Only declared `hasTasks: true` task-capable artifacts may gate task completion.                            | Builder validation and tests conform.                             | Conformant.                                 |
| `core:get-status`           | Schema failure yields read-only status, no available transitions, and a stable actionable blocker.         | `SCHEMA_RESOLUTION_FAILED` is produced and asserted.              | **P2 internal spec inconsistency remains.** |
| `core:config-writer-port`   | Initialization does not synthesize unrelated plugin configuration.                                         | FS implementation and tests conform.                              | Conformant.                                 |

## Findings

### HYG-R1 — Three-form hook contract was added but the previous two-form invariant was not replaced

- **Spec(s):** `core:hook-execution-model`; direct dependency `core:schema-format`
- **Category:** intra-spec and dependency-spec contradiction
- **Severity:** P2
- **Evidence:** The merged change preview adds “Three hook entry forms” and its scenario correctly declares `instruction:`, `run:`, and `external:`. Runtime agrees: the parser maps `external:` to `HookEntry { type: 'external' }` (`packages/core/src/infrastructure/schema-yaml-parser.ts:232-244`), and `RunStepHooks` dispatches it through registered runners (`packages/core/src/application/use-cases/run-step-hooks.ts:294-306`). Tests cover parser acceptance (`packages/core/test/infrastructure/schema-yaml-parser.spec.ts:251-267`), successful dispatch (`packages/core/test/application/use-cases/run-step-hooks.spec.ts:173-205`), and an unregistered type failure (`:207+`).

  However, the retained `core:hook-execution-model` requirement still says hooks come in “exactly two types” and that _every_ entry declares exactly one of `instruction:` or `run:` (`specs/core/hook-execution-model/spec.md:9-18`), while its following retained requirement says `external` is an additional entry (`:20-32`). The direct `core:schema-format` constraint likewise says every entry has `instruction` or `run` (`specs/core/schema-format/spec.md:492`), excluding `external` despite its own explicit-external-hook requirement.

- **Impact:** The implementation and new scenario are correct, but the archived public contracts would remain mutually exclusive for schema authors.
- **Suggested remediation:** Replace—not append—the old two-form/two-key wording and amend the schema-format constraint to enumerate all three forms. No runtime change is indicated.

### HYG-R2 — Plugin metadata-extraction prohibition is implemented and documented, but contradicts the retained schema-plugin list

- **Spec:** `core:schema-format`
- **Category:** intra-spec contradiction
- **Severity:** P2
- **Evidence:** The merged change preview correctly adds “A schema plugin MUST NOT declare or mutate `metadataExtraction`.” Parser refinement enforces `s.metadataExtraction === undefined` for `kind: schema-plugin` (`packages/core/src/infrastructure/schema-yaml-parser.ts:330-352`); the focused rejection test is present at `packages/core/test/infrastructure/schema-yaml-parser.spec.ts:144-147`. User documentation is aligned: `docs/guide/configuration.md:715` and `docs/config/config-reference.md:454` both say plugins cannot declare a top-level extraction block, and ADR 0010 says the same (`docs/adr/0010-schema-format.md:90-112`).

  The retained “Schema plugin kind” list nevertheless still says a plugin **MAY** declare `metadataExtraction` (`specs/core/schema-format/spec.md:414-423`).

- **Impact:** The public spec is internally contradictory even though parser, test, and user-facing documentation agree on the intended prohibition.
- **Suggested remediation:** Remove `metadataExtraction` from that MAY list (or replace the entire list with the final allowed set). No implementation change is indicated.

### HYG-R3 — Actionable schema-resolution blocker is implemented and tested, but conflicts with the retained silent-degradation contract

- **Spec:** `core:get-status`
- **Category:** intra-spec contradiction
- **Severity:** P2
- **Evidence:** The new merged requirement/scenario requires no available transitions plus an actionable schema-resolution blocker. On `SchemaNotFoundError`, `GetStatus` now returns `SCHEMA_RESOLUTION_FAILED` with a recovery message (`packages/core/src/application/use-cases/get-status.ts:393-407`), while preserving the read-only no-transition projection. The focused regression assertion checks the exact blocker code/message and empty available transitions (`packages/core/test/application/use-cases/get-status.spec.ts:292-307`).

  The retained “Graceful degradation when schema resolution fails” requirement still requires `blockers` to be empty and says degradation occurs silently (`specs/core/get-status/spec.md:217-229`).

- **Impact:** This is a CRITICAL graph surface (`GetStatus`: 10 direct, 4 indirect dependents, including kernel composition and SDK host context). Consumers now receive the right actionable behavior, but the versioned specification exposes incompatible contracts.
- **Suggested remediation:** Replace the old empty-blocker/silent clauses with the new blocker contract. Do not revert runtime behavior; the new scenario and test provide the desired public behavior.

## Conformant requirements

### `core:change` — Task completion scope

`buildSchema` defaults `hasTasks` to false and rejects a `requiresTaskCompletion` reference unless it targets an artifact with task capability (`packages/core/src/domain/services/build-schema.ts:526-544, 725-743`). Tests reject an ungated artifact (`packages/core/test/domain/services/build-schema.spec.ts:407-423`), reject explicit `hasTasks: false` (`:453-472`), and accept the `hasTasks: true` path (`:474-492`). This agrees with `core:schema-format` and lifecycle/transition dependencies.

### `core:config-writer-port` — Optional initialization and plugin configuration

`FsConfigWriter.initProject` creates only schema/workspace configuration and does not write `plugins` (`packages/core/src/infrastructure/fs/config-writer.ts:39-65`). `addPlugin` emits `{ name }` without optional configuration and writes configuration only when supplied (`:91-119`). The FS test suite verifies initial configuration shape (`packages/core/test/infrastructure/fs/config-writer.spec.ts:39-59`) plus unconfigured and configured plugin behavior (`:146-172`). This conforms to `core:config` and `default:_global/architecture` port/infrastructure layering.

## Test coverage

| Requirement                            | Evidence                                                                                          | Assessment                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Three hook forms                       | Parser external-form test; registered/unregistered external-runner tests; merged verify scenario. | Adequate for behavior; spec replacement remains needed.         |
| Plugin metadata-extraction prohibition | Focused parser rejection test and aligned user docs.                                              | Adequate for behavior/documentation; stale MAY clause remains.  |
| Task completion scope                  | Builder validation tests for false/true capability and declared gating.                           | Adequate.                                                       |
| Schema-resolution blocker              | Focused exact-code/message regression test and merged verify scenario.                            | Adequate for behavior; stale silent-degradation clause remains. |
| Optional ConfigWriter configuration    | Initialization, unconfigured addition, configured update tests.                                   | Adequate.                                                       |

No missing runtime tests were identified in this scoped batch. The three findings are specification-replacement gaps, not untested behavior.

## Dependency and global-consistency review

- `core:hook-execution-model` depends directly on `core:schema-format`, hook execution/use-case specs, and transition/archive paths. The new three-form contract agrees with runtime, but the old two-key constraints in both specs need synchronized replacement.
- `core:schema-format` depends on schema merge/selector/content-extraction contracts. Its corrected prohibition agrees with parser, user documentation, and ADR 0010; only the retained MAY list conflicts.
- `core:change` is consistent with `core:workflow-model`, `core:lifecycle-engine`, and `core:transition-checks` task-gating semantics.
- `core:get-status` is consistent with its read-only architecture and transition fail-closed behavior. Its blocker behavior is an additive status projection, not a mutation bypass.
- `core:config-writer-port` remains within the global hexagonal architecture: port in application, filesystem/YAML work in infrastructure, composition factory for delivery access.

## Totals

- Scoped clarifications audited: **5**
- Runtime behavior conformant: **5**
- Test coverage adequate: **5**
- User-documentation alignment checked: **metadata plugin prohibition conforms**
- Open findings: **3** specification contradictions (all P2)
- Runtime implementation bugs: **0**
- Missing runtime tests: **0**
- P0: **0**; P1: **0**; P2: **3**; P3: **0**

# Spec compliance audit — core runtime

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`  
**Audit date:** 2026-09-19  
**Mode:** change-spec preview against current implementation, direct dependencies, and global architecture.

## Scope and method

- Read the effective change previews for all four scoped specs, rather than raw deltas.
- Confirmed the graph is current, content-fresh, complete, and non-stale.
- Used graph impact for the high-risk `TransitionChange` surface (10 direct / 126 indirect dependents; 54 affected files) and the medium-risk archive snapshot resolver (4 direct / 4 indirect dependents; 8 affected files).
- Checked `core:transition-checks`, `core:spec-overlap`, and `default:_global/architecture` as direct/global constraints.
- Ran the four focused test files: **4 passed, 127 tests passed**.

## Requirements summary

| Spec                     | Effective change requirement                                                                                                            | Result |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `core:transition-change` | Non-drain requests from historic parked approval states fail as typed `approval-required` before protocol validation.                   | Pass   |
| `core:lifecycle-engine`  | Failed `workflow.requires` predicate details preserve the blocking artifact in `transitionBlockers`.                                    | Pass   |
| `core:transition-checks` | Approval precedence is retained; production status/archive composition injects overlap detection while isolated registries may omit it. | Pass   |
| `core:archive-change`    | The fallback batch snapshot instance persists through snapshot, created-file recording, and restore.                                    | Pass   |

## Implementation and test evidence

### `core:transition-change`

`TransitionChange._assertDrainAndGateTargets` executes before predicate evaluation. For `pending-spec-approval` and `pending-signoff`, it throws `InvalidStateTransitionError` with `{ type: 'approval-required', gate: 'spec' | 'signoff' }` on every non-drain request. It therefore prevents `protocol.edge` from replacing actionable approval repair guidance with `invalid-transition`.

- Implementation: `packages/core/src/application/use-cases/transition-change.ts:339`
- Regression coverage: `packages/core/test/application/use-cases/transition-change.spec.ts:532` (`pending-spec-approval -> implementing`) and `:543` (`pending-signoff -> archivable`).

### `core:lifecycle-engine`

`transitionBlockers` delegates blocker selection to `blockingArtifactIds`. When the supplied `workflow.requires` check fails, that helper returns its `details.artifactId`, which becomes the `blocking` entry. This preserves the shared check result's actionable identity without recomputing a competing status traversal.

- Implementation: `packages/core/src/domain/services/lifecycle-verdict.ts:209`, `:753`
- Regression coverage: `packages/core/test/domain/services/lifecycle-verdict.spec.ts:155`.

### `core:transition-checks`

The registry's default `includeOverlapDetection` remains off only for isolated composition, which is explicitly allowed by the effective requirement. Production consumers both pass `includeOverlapDetection: true`: `resolveGetStatusDeps` and `resolveArchiveChangeDeps`. The registry test verifies the injected detector reports a peer overlap; its omitted-option test verifies the intended isolated behavior.

- Implementation: `packages/core/src/composition/use-cases/workflow-check-registry.ts:23`, `packages/core/src/composition/use-cases/get-status.ts:42`, `packages/core/src/composition/use-cases/archive-change.ts:133`
- Regression coverage: `packages/core/test/composition/use-cases/workflow-check-registry.spec.ts:61`, `packages/core/test/composition/use-cases/get-status.spec.ts:106`.

### `core:archive-change`

When layouts are unavailable, `resolveArchiveBatchSnapshotPort` closes over one lazy `Promise<FsArchiveBatchSnapshot>`. Every port method calls `resolveSnapshot`, so state recorded during `snapshot` remains available to `recordCreatedFile` and `restoreBatch`.

- Implementation: `packages/core/src/composition/use-cases/archive-change.ts:63`
- Regression coverage: `packages/core/test/composition/archive-batch-snapshot-port.spec.ts:63` creates a file after snapshot, records it, restores, and confirms removal.

## Dependency and global consistency

- `core:transition-change` appropriately establishes the narrow pre-predicate exception required for historic repair guidance, while `core:transition-checks` remains the source for ordinary predicate execution. No duplicate generalized check implementation was introduced.
- `core:lifecycle-engine` projects the `core:transition-checks` result rather than reimplementing `workflow.requires`; that matches the shared-check contract.
- `core:transition-checks` production overlap wiring conforms to `core:spec-overlap`: the composition layer performs repository I/O then calls the pure overlap domain service.
- `TransitionChange` remains an application use case using ports and typed entity/domain errors; `evaluateLifecycleVerdict` remains a stateless domain function; the fallback snapshot code is in composition. These placements conform to `default:_global/architecture`.
- The graph's high impact for `TransitionChange` is acknowledged by focused regression tests. No dependent contract required a source change because the public typed-error shape is preserved and corrected.

## Discrepancies

No implementation/spec inconsistency was found.

| Category               | Severity | Count | Evidence                                                                                                           |
| ---------------------- | -------- | ----: | ------------------------------------------------------------------------------------------------------------------ |
| Implementation bug     | P0/P1/P2 |     0 | All effective requirements match code and focused tests.                                                           |
| Spec drift             | P0/P1/P2 |     0 | The previews are consistent with direct check/overlap/global contracts.                                            |
| Required test gap      | P2       |     0 | Each changed runtime behavior has direct regression coverage.                                                      |
| Optional strengthening | P3       |     1 | A real CLI composition E2E overlap case could supplement existing registry and factory-wiring tests; non-blocking. |

## Test coverage and missing tests

```text
pnpm exec vitest run \
  packages/core/test/application/use-cases/transition-change.spec.ts \
  packages/core/test/domain/services/lifecycle-verdict.spec.ts \
  packages/core/test/composition/use-cases/workflow-check-registry.spec.ts \
  packages/core/test/composition/archive-batch-snapshot-port.spec.ts

Test Files  4 passed (4)
Tests       127 passed (127)
```

No missing test blocks verification or archive. The P3 E2E suggestion is quality hardening only.

## Summary counts

- Specs audited: 4
- Effective change requirements audited: 4
- Conformant: 4
- P0: 0
- P1: 0
- P2: 0
- P3 optional follow-ups: 1

The historic parked approval review concern is resolved in the current implementation: the desired typed `approval-required` result now has precedence over the protocol-edge failure.

# Fresh compliance audit — CLI and skills batch

## Scope, evidence, and dependencies

Audited the merged previews for `lifecycle-polish-followups`:

- `cli:change-status`
- `skills:skill-templates-source`
- `cli:change-archive`
- `cli:change-artifact-instruction`

The change is in `verifying`, with all artifacts complete, 12/12 tasks complete, and no
lifecycle blockers. The code graph is current. Audit navigation used graph symbol lookup
for the three CLI registration functions and source/test inspection. Relevant direct
dependencies reviewed from the change manifest are `cli:entrypoint`, `core:change`,
`core:get-status`, `sdk:build-implementation-review`, `core:transition-checks`,
`core:archive-change`, `core:hook-execution-model`, `cli:command-resource-naming`,
`core:get-artifact-instruction`, `skills:skill`, `skills:workflow-automation`, and
`cli:spec-optimizations`. The project architecture constraint is compatible: CLI and
templates delegate business decisions to Core/SDK rather than duplicating them.

## Requirements and implementation assessment

### `cli:change-status`

The merged spec requires drift-aware output, schema DAG projection, drafted read-only
behavior, Core-derived lifecycle transitions/blockers/next action, implementation
projection, and human-readable display states.

`registerChangeStatus` is a graph-indexed public function in
`packages/cli/src/commands/change/status.ts`. It delegates status resolution to
`kernel.changes.status.execute`; it does not independently recompute lifecycle state.
The rendering paths use `displayStatus ?? effectiveStatus ?? state` for artifacts and
structured DAG output, which repairs the absent-display-status UX case while retaining
canonical state. The command uses the resolved schema DAG when available and otherwise
the lifecycle schema snapshot.

`packages/cli/test/commands/change/status.spec.ts` covers drafted output, the
display-status fallback, drift-aware JSON DAG state, `hasTasks`, schema DAG children,
schema-version warnings, blocker labels, and GetStatus-derived transitions.

**Finding: conformant.**

### `cli:change-archive`

The change adds a documentation contract: `specd changes archive <name>` is canonical;
`specd change archive <name>` remains a compatibility alias with identical semantics.

`packages/cli/src/index.ts` defines one `changes` Commander group with `.alias('change')`
and installs `registerChangeArchive` only once on that group. Consequently both command
spellings execute the same handler. The handler delegates all archive semantics,
progress, hooks, and overlap handling to `kernel.changes.archive.execute`, consistent
with the Core archive and hook contracts.

`packages/cli/test/commands/change/archive.spec.ts` covers handler success/failure,
structured progress, hook phase forwarding, overlap, and archive options.

**Finding: conformant.**

### `cli:change-artifact-instruction`

The command's contract is delegation-only and read-only; the change clarifies agent
timing: context first, then fetch only the current instruction immediately before
authoring, with no template-as-context or future-instruction prefetch.

`registerChangeArtifactInstruction` delegates directly to
`kernel.changes.getArtifactInstruction.execute`, returns the Core response parts without
schema/rule recomputation, and handles text/structured results and domain errors.
`packages/skills/templates/shared/shared.md.tpl` requires context before instructions,
while `packages/skills/templates/skills/specd-design/SKILL.md.tpl` fetches the current
artifact in Step 6 and says “Immediately after” before Step 7 authoring. This satisfies
the timing requirement without moving workflow responsibility into the CLI renderer.

`packages/cli/test/commands/change-artifact-instruction.spec.ts` covers JSON/text
sections and domain-error routing; Core's context tests cover omission of artifact
instructions from compiled context.

**Finding: conformant.**

### `skills:skill-templates-source`

The merged fast-track requirement requires a Step 2 stop and explicit user choice before
formal artifacts, plus the term `dependents` with `--direction dependents` rather than
downstream-as-dependents wording.

`packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` explicitly stops at
Step 2 until the user chooses a change, keeps the manual-only boundary, and uses
`--direction dependents` for both file and symbol blast-radius analysis. It calls
affected callers/modules dependents and retains the required hand-off stop.
`packages/skills/test/template-workflow.spec.ts` asserts the stop wording, required
template metadata, dependents regression guidance, and absence of downstream-dependent
phrasing.

**Finding: conformant.**

## Discrepancies

None. No code/spec mismatch or conflict with the direct dependency/global contracts was
identified in this batch.

## Test coverage gaps

### P3 — top-level archive alias parsing

The archive tests attach the handler to a synthetic `change` parent. They therefore test
the archive behavior but do not parse both literal top-level invocations,
`specd changes archive <name>` and `specd change archive <name>`, through the real CLI
registration. Current implementation makes divergence unlikely because one Commander
group owns both spellings, so this is a non-blocking regression-test opportunity rather
than a discrepancy. Add it when command-registration coverage is next touched.

## Totals

| Metric                         |                Count |
| ------------------------------ | -------------------: |
| Specs audited                  |                    4 |
| Requirement groups assessed    |                    4 |
| Implementation discrepancies   |                    0 |
| Spec/dependency contradictions |                    0 |
| Test gaps                      | 1 (P3, non-blocking) |
| Blocking findings              |                    0 |

### Core runtime

<details>
<summary>Open complete partial report</summary>

See [\_partial-core-runtime.md](_partial-core-runtime.md).

</details>

### CLI and skills

<details>
<summary>Open complete partial report</summary>

See [\_partial-cli-skills.md](_partial-cli-skills.md).

</details>
