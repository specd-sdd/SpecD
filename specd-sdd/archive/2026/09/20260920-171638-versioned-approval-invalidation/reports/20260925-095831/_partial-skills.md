# Skills compliance partial: workflow automation and template source

Audit mode: delegated full verification for `versioned-approval-invalidation`; this partial owns only `skills:workflow-automation` and `skills:skill-templates-source`. The graph was current (`1215` indexed files, no stale workspaces). No verification attempt command was run by this auditor.

## Requirements Summary

### `skills:workflow-automation`

The merged spec contains the ten established workflow requirements plus the change-added **Reconciled invalidation protocol in lifecycle templates** requirement. It requires fresh reconciled status; core-owned invalidation/recovery; separate artifact/workflow policy handling; explicit verification attempt ownership; in-place renewal after input change; correct `hasTasks` treatment; and installed-copy synchronization. Its three merged scenarios require: (1) consistent standalone/delegated ownership in source and installed copies, (2) report-only non-change compliance modes, and (3) tests covering every delegated downstream decision rather than phrases alone.

### `skills:skill-templates-source`

The merged spec contains 24 requirements (23 existing plus the added reconciled-invalidation requirement). Relevant lifecycle/template requirements cover source layout and rendering, capability-aware output, command/read-surface roles, in-place approval gates, overlap handling, implementation tracking, archive hooks, review scope, fast-track guidance, and the same source-to-installed reconciliation/attempt-ownership protocol. The change-added requirement has the same three scenarios above and requires delegated compliance to retain all change-scoped behavior except attempt ownership.

## Implementation Status

Implemented in the canonical Skills sources:

- `packages/skills/templates/shared/shared.md.tpl` defines canonical freshness/reconciliation and attempt ownership: status is authoritative; agents do not compute fingerprints or manipulate projections; explicit `verification start` captures a baseline; delegated compliance neither starts nor completes it.
- `packages/skills/templates/skills/specd-verify/SKILL.md.tpl` owns start/complete in both simple and full modes and invokes compliance with `--delegated --attempt <attemptId>`.
- `packages/skills/templates/skills/specd-compliance/SKILL.md.tpl` distinguishes standalone and delegated modes before the standalone `--change` branch. Its downstream decision table keeps status, context, scope, direct dependencies, merged preview reads, report directory, and filename change-scoped for delegated mode, with only start/complete changed to `no`.
- The lifecycle templates (`specd-design`, `specd-implement`, `specd-verify`, `specd-archive`), shared guidance, and associated source tests carry the reconciled invalidation language.
- Installed copies in `.agents/skills`, `.codex/skills`, `.claude/skills`, `.github/skills`, and `.opencode/skills` are checked by parity tests. The installed `.specd/config/skills/shared/shared.md` is checked against the same shared protocol phrases.

The source changes are limited to the expected templates and tests under `packages/skills`; no unrelated Skills runtime implementation was required for this documentation/template protocol change.

## Discrepancies

None found.

No severity findings are raised. The attempted narrow `spec-preview --artifact spec.md|verify.md` commands correctly rejected filenames because the schema artifact IDs are `specs` and `verify`; full `changes spec-preview <change> <specId>` was used for both scoped specs, and raw deltas were read only to enumerate the added requirement/scenarios.

## Test Coverage

Executed:

```text
pnpm --filter @specd/skills test -- template-workflow.spec.ts generated-skill-protocol.spec.ts infrastructure/skill-repository.spec.ts
```

Result: **9 test files passed; 61 tests passed**.

Coverage evidence:

- `template-workflow.spec.ts` asserts exact command/read-surface contracts, in-place gates, overlap handling, implementation-file draining, archive hook behavior, reconciliation language, verification ownership, and the full delegated decision row.
- Its delegated-row test compares the first seven downstream decision cells for `change` and `delegated`, then asserts standalone `yes/yes` versus delegated `no/no` attempt ownership. This is behavioral structure, not phrase-only checking.
- `generated-skill-protocol.spec.ts` checks source phrases in every installed runtime copy and compares the complete delegated decision-table segment in each installed compliance skill; it also checks the installed shared copy.
- `infrastructure/skill-repository.spec.ts` renders source templates through `createSkillRepository()` and asserts that verify/compliance/shared protocol content, including the delegated decision matrix, survives bundling.

## Missing Tests

No requirement-blocking gap found. The existing tests cover the change-added scenarios at source, renderer, and installed-copy levels.

Non-blocking future hardening opportunity: parity tests intentionally assert protocol phrases and the compliance decision table, rather than byte-for-byte equivalence of every rendered installed lifecycle skill. That is outside the merged requirement, which requires consistent ownership protocol, and does not affect this verification result.

## Spec Dependency Chain

`skills:workflow-automation`
→ `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, `core:transition-checks`.

`skills:skill-templates-source`
→ `skills:skill`, `cli:spec-optimizations`, `skills:workflow-automation`, `core:transition-checks`.

The implementation reflects the chain: templates encode agent workflow policy; the Skills renderer (`createSkillRepository` / `ResolveBundle`) emits the bundled form; installed copies are validated for the newly materialized lifecycle protocol.

## Summary counts

| Item                               |         Count |
| ---------------------------------- | ------------: |
| Specs audited                      |             2 |
| Merged requirements assessed       |            35 |
| Change-added requirements assessed |             2 |
| Change-added scenarios assessed    |             6 |
| Discrepancies                      |             0 |
| Critical / High / Medium / Low     | 0 / 0 / 0 / 0 |
| Test commands executed             |             1 |
| Tests passed                       |            61 |
| Missing requirement-blocking tests |             0 |
