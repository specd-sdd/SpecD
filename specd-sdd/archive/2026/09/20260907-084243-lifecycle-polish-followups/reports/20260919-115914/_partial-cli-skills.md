# Compliance audit partial — CLI and skills

## Scope and method

- Change: `lifecycle-polish-followups` (state: `verifying`).
- Audited change specs: `cli:change-status`, `cli:change-archive`,
  `cli:change-artifact-instruction`, and `skills:skill-templates-source`.
- Direct dependency contracts considered: `cli:entrypoint`, `core:change`,
  `core:get-status`, `sdk:build-implementation-review`,
  `core:transition-checks`, `core:archive-change`, `core:hook-execution-model`,
  `cli:command-resource-naming`, `core:get-artifact-instruction`, `skills:skill`,
  `skills:workflow-automation`, and `cli:spec-optimizations`.
- Evidence: merged change previews, a current code graph (1175 files, 41,205 symbols),
  source and test inspection, and the completed repository test run (`pnpm test`: 14/14 tasks successful).

## Requirements and implementation

### `cli:change-status`

The merged contract requires status to project Core's lifecycle and display-state data
without independent lifecycle recomputation; preserve canonical and display states in
structured output; render task counts/DAG information; support drafted read-only output;
and provide schema, blockers, review, implementation, and dependency projections.

`packages/cli/src/commands/change/status.ts` delegates to
`kernel.changes.status.execute`, preserves Core lifecycle fields, and uses the display
fallback (`displayStatus ?? effectiveStatus ?? state`) for human-facing artifact and
file rendering. `resolveStatusSchemaDag` uses the active schema DAG when available and
otherwise the lifecycle snapshot, matching the contract's cached-DAG requirement.

`packages/cli/test/commands/change/status.spec.ts` covers drafted output, display-state
fallback (including absent `displayStatus`), DAG children/order, `hasTasks`, drift-aware
structured state, schema warning, blockers/check labels, and GetStatus transition
projections.

**Result: conformant.**

### `cli:change-archive`

The added requirement establishes `specd changes archive <name>` as canonical while
retaining `specd change archive <name>` with identical semantics.

`packages/cli/src/index.ts` registers the command group as `changes` and declares
`change` as its Commander alias; `registerChangeArchive` attaches the same `archive`
subcommand to that shared group. The implementation therefore gives both spellings the
same handler, options, progress stream, overlap behavior, and archive use-case call.
This is consistent with `cli:entrypoint` and `cli:command-resource-naming`.

`packages/cli/test/commands/change/archive.spec.ts` thoroughly covers archive handler
success/failure, structured progress, hooks, overlap, and option forwarding.

**Result: conformant.**

### `cli:change-artifact-instruction`

The added requirement is workflow guidance: load change context first, then fetch the
current artifact instruction immediately before authoring; do not use template I/O as
context or prefetch future instructions.

The CLI handler in `packages/cli/src/commands/change/artifact-instruction.ts` is a thin
delegation to `kernel.changes.getArtifactInstruction.execute`, retaining its current
artifact argument and returning the instruction/template/delta/rule block unchanged.
The writing workflow in `packages/skills/templates/skills/specd-design/SKILL.md.tpl`
loads context through shared guidance, retrieves the current artifact at Step 6, and
immediately directs authoring in Step 7; it does not use template I/O as a context
surface or prefetch later artifacts. This also matches the shared artifact-instruction
processing order.

`packages/cli/test/commands/change-artifact-instruction.spec.ts` verifies JSON and text
projection of the Core response and domain-error routing. `core` coverage additionally
asserts compiled context excludes artifact instructions.

**Result: conformant.**

### `skills:skill-templates-source`

The merged fast-track contract requires explicit Step 2 user confirmation before formal
artifacts, `dependents` terminology with `--direction dependents`, and no downstream-as-
dependents wording.

`packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` explicitly stops after
Step 2 pending the user's selection, uses `--direction dependents` for file and symbol
impact, and calls impacted callers/modules “dependents.” It retains the manual-only
activation boundary, live journal, implementation tracking, and explicit hand-off stop.

`packages/skills/test/template-workflow.spec.ts` asserts the Step 2 stop wording, the
absence of downstream-dependent terminology, the required dependents regression heading,
metadata shape, graph/context commands, journal rules, and hand-off prohibition.

**Result: conformant.**

## Discrepancies

None found in this batch.

No implementation behavior contradicts the merged requirements or the relevant direct
dependency contracts. The archive terminology change is documentation hygiene, not a
runtime command rename: the plural command is canonical and the singular spelling is a
single shared Commander alias, so their semantics cannot diverge at the registration
layer.

## Test coverage gaps

### P3 — command-group alias integration coverage

**Category:** test gap (non-blocking).

Archive unit tests instantiate `registerChangeArchive` beneath a synthetic `change`
parent, which exercises the handler but not the top-level Commander group registration.
There is no focused CLI integration test that invokes both literal spellings
`changes archive` and `change archive` and asserts the same archive invocation.

The implementation evidence is strong (`changes` plus `.alias('change')` on one parent),
so this is not a behavioral discrepancy. Add a small index/CLI parsing regression test
only when touching command-registration coverage or if a later Commander upgrade changes
alias handling.

## Dependency consistency

- `cli:change-status` delegates lifecycle/tracking state to SDK/Core rather than
  recomputing it, consistent with `core:get-status`, `core:transition-checks`, and
  `sdk:build-implementation-review`.
- `cli:change-archive` delegates archive semantics to Core and exposes its progress/
  overlap results, consistent with `core:archive-change` and hook contracts.
- `cli:change-artifact-instruction` delegates instruction selection to Core; agent timing
  is correctly owned by workflow templates, not by the response-rendering CLI handler.
- The fast-track template's graph and manual-activation instructions conform to
  `skills:workflow-automation`, `skills:skill`, and `core:transition-checks`.

## Totals

| Metric                         |                Count |
| ------------------------------ | -------------------: |
| Specs audited                  |                    4 |
| Requirement groups assessed    |                    4 |
| Implementation discrepancies   |                    0 |
| Spec/dependency contradictions |                    0 |
| Test coverage gaps             | 1 (P3, non-blocking) |
| Blocking findings              |                    0 |
