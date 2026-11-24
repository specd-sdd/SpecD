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
