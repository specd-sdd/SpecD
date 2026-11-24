# Proposal: lifecycle-polish-followups

## Motivation

Lifecycle consumers need typed, actionable repair guidance and stable status output. A small set of confirmed regressions currently weakens that contract across Core, the CLI, archive composition, and the fast-track template.

## Current behaviour

Historic parked approval states can report `invalid-transition` before the required approval guidance for non-drain requests. Predicate-derived lifecycle blockers can omit the blocking artifact ID, status rendering can emit `undefined` when `displayStatus` is absent, the archive snapshot fallback does not retain rollback state across operations, and the fast-track template does not make its Step 2 confirmation boundary explicit.

## Proposed solution

Formalize the already-tested, minimal fixes: prioritize parked-state approval failures, preserve blocker artifact identity, fall back to canonical status for CLI rendering, share one lazy archive snapshot fallback, and align the fast-track template's stop gate and dependents terminology. Resolve lifecycle documentation hygiene by recording `external` as the third hook form, prohibiting plugin-owned metadata extraction, and making schema-resolution failure actionable while keeping mutations fail-closed.

## Specs affected

### New specs

None.

### Modified specs

- `core:transition-change`: Preserve typed approval-required failures for historic parked non-drain transition requests.
  - Depends on (added): none
  - Depends on (removed): none
- `core:lifecycle-engine`: Project the required artifact ID into predicate-backed transition blockers.
  - Depends on (added): none
  - Depends on (removed): none
- `core:transition-checks`: Define approval-error precedence and production overlap-registry wiring guidance.
  - Depends on (added): none
  - Depends on (removed): none
- `core:archive-change`: Require a single fallback snapshot instance for a composed archive operation.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-status`: Define a non-undefined display-status fallback and document active versus drafted JSON projections.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-templates-source`: Require an explicit Step 2 pause and use dependents for blast-radius terminology.
  - Depends on (added): none
  - Depends on (removed): none
- `core:hook-execution-model`: Clarify the three schema hook forms, including the currently unimplemented external runner form.
  - Depends on (added): none
  - Depends on (removed): none
- `core:schema-format`: Prohibit schema plugins from declaring metadata extraction, matching parser behavior, and correct schema-plugin user documentation.
  - Depends on (added): none
  - Depends on (removed): none
- `core:change`: Limit task-bearing completion claims to artifacts that declare task checks. This overlap with `implementation-snapshot` is intentionally coordinated.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-status`: Return an actionable schema-resolution blocker while retaining fail-closed transition checks.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-archive`: Document the canonical plural archive command and supported singular alias.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-writer-port`: Align initialization and plugin operations with their optional configuration behavior.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-artifact-instruction`: Define artifact-instruction retrieval after context loading and before artifact work.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The implementation surface is limited to `TransitionChange`, `evaluateLifecycleVerdict`, `resolveArchiveBatchSnapshotPort`, CLI `registerChangeStatus`, the fast-track skill template, the degraded `GetStatus` projection, and the schema-plugin documentation in `docs/guide/configuration.md` and `docs/config/config-reference.md`, with focused regression suites. Graph impact identifies `TransitionChange` as critical because it is reached by lifecycle factories, approvals, Kernel composition, CLI/API hosts, and 54 affected files; the archive snapshot resolver has medium impact through Kernel archive composition and eight affected files. The change adds regression coverage at those boundaries without introducing new external dependencies or data migrations.

## Technical context

The user chose a new, all-inclusive fast-track change rather than reopening the historical workflow change, so the work remains traceable and can be tested before formal specs are authored. The selected approach keeps approval behavior in the transition use case, lifecycle projection in the pure domain verdict, I/O and adapter lifetime in composition, and presentation fallback in the CLI. Focused Core, CLI, skills, archive rollback, and typecheck verification passed during the fast-track session.

## Open questions

None. The selected active/draft status shape is to document the observed compatibility contract: active lifecycle fields are nested under `lifecycle`, while drafted inspection retains empty legacy top-level transition arrays and omits an artifact DAG.
