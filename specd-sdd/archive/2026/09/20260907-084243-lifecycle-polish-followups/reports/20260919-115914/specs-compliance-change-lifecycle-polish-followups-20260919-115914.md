# Spec compliance audit — lifecycle-polish-followups

**Mode:** change-scoped, read-only  
**Date:** 2026-09-19  
**Graph:** current; complete coverage; no stale workspaces.

## Scope

Audited all 13 change specs, their direct dependencies, and applicable global contracts:

- Core runtime: `core:transition-change`, `core:lifecycle-engine`, `core:transition-checks`, `core:archive-change`
- CLI and workflow templates: `cli:change-status`, `cli:change-archive`, `cli:change-artifact-instruction`, `skills:skill-templates-source`
- Hygiene reconciliation: `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, `core:config-writer-port`

Evidence includes merged spec previews, graph navigation, source/test inspection, implementation tracking, and the enclosing `pnpm test` run (14/14 Turbo tasks successful).

## Summary

| Severity | Count | Disposition                                                       |
| -------- | ----: | ----------------------------------------------------------------- |
| P0       |     0 | None                                                              |
| P1       |     1 | Contract choice and likely code/test change required              |
| P2       |     2 | Spec contradictions; low-risk spec-only reconciliation is favored |
| P3       |     2 | Optional regression-strengthening tests                           |

The review finding that prompted this change is resolved: historic parked approval states now produce typed `approval-required` errors before protocol-edge validation for non-drain targets, with direct regression coverage.

### Findings

1. **HYG-003 (P1): `core:get-status` degraded schema status is contradictory.** The new delta requires a schema-resolution blocker, but current behavior and the retained requirement return an empty blocker list. Choose either: (a) preserve intentionally silent degradation and amend the new delta, or (b) emit a stable schema-resolution `LifecycleBlocker`, update the older requirement, and add tests. The audit recommends **(b)** because it gives CLI/API users actionable repair guidance while retaining fail-closed mutations.
2. **HYG-001 (P2): external hooks still form a third schema entry type.** Existing merged requirements and runtime support `external: { type, config }`; the new two-form wording contradicts them. The audit recommends a **spec-only correction**: state that `external` is a third entry form, rather than a runner backend for `run:`.
3. **HYG-002 (P2): schema-plugin metadata extraction contract remains contradictory.** A retained requirement permits `metadataExtraction`, whereas the parser rejects it. The audit recommends a **spec-only correction** to prohibit it and a focused parser rejection test.
4. **P3 test gaps:** optional real-composition status/archive overlap E2E coverage; and one top-level Commander test that invokes both `changes archive` and its `change archive` alias.

## Detailed findings

The complete batch reports are retained verbatim as audit traceability artifacts in this directory:

- `_partial-core-runtime.md`
- `_partial-cli-skills.md`
- `_partial-core-hygiene.md`

They contain the full per-requirement evidence, implementation status, dependency review, and coverage assessment. No code or specification files were modified by this audit.

## Verification state

- All change artifacts are complete and validated.
- Implementation tracking: 10 resolved links, 0 open links, 0 out-of-scope sidecars.
- Verification hooks: no post-hook actions or instructions.
- Change state remains `verifying`; no state transition was performed by this audit.
