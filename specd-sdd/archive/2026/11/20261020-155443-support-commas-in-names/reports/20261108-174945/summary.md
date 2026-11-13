# Full verification and compliance: support-commas-in-names

Date: 2026-11-08. Result: **NOT CLEAN — user decision required**. Lifecycle remains `verifying`.

## Verification

31 merged change specs, 368 compiled requirement groups and 1,311 compiled scenario entries were inventoried and reviewed against implementation and tests. Inventories include duplicate/overlapping scenarios; they are not counts of independently executed test cases. Requirement-level source and suite evidence, focused reproductions and coverage limitations are recorded in each partial report.

Fresh checks passed: full build (13 tasks, zero cache hits); direct TypeScript checks in core/cli/sdk/skills/guide; 4,515 tests in those five packages (345 files); ESLint on 151 modified/new TypeScript files; `git diff --check`. Verifying post-hooks returned no hooks/instructions. The graph was refreshed and reported current. Local execution was macOS/Node 25.9.0; Windows/Linux/Node 22 CI was not executed locally.

The primary comma-preservation behavior is supported, but the full merged acceptance contracts are not all satisfied. Passing tests do not override contradictory scenarios or reproduced missing branches.

## Current implementation gaps

| ID  | Priority | Finding                                                                                          | Evidence                                                                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| CM1 | Medium   | A new batch with case aliases records two files/links on case-insensitive hosts.                 | `update-implementation-tracking.ts:137`; reproduced with `Docs/Notes.md` and `docs/notes.md` against the rebuilt public API. |
| CM2 | Medium   | Invalid `defaultWorkspace` overrides bypass syntax validation and produce invalid qualified IDs. | `parse-spec-id.ts:46`; reproduced with one-character, uppercase, device-name and empty overrides.                            |
| CM3 | Low      | A one-shot workspace iterable is exhausted after the first use-case execution.                   | `update-spec-deps.ts:66` and `:102`; the second call after construction with `Map.keys()` throws WORKSPACE_NOT_FOUND.        |
| CM6 | Low      | Lock errors omit the invalid persisted ID value required by the identity spec.                   | `parse-spec-lock.ts:124`; error includes field/path/rule, but not the offending value.                                       |

These are three runtime edge cases and one diagnostic-contract gap, not failures of the ordinary whole-name list behavior. Their missing regression tests are described in the Core mutation report.

## Baseline discrepancies and specification reconciliation

Fourteen additional finding groups concern unchanged behavior, stale artifacts or neighboring-spec contradictions. They are included because Full mode audits the complete merged scope; they are **not fourteen regressions introduced by this change**.

| IDs            | Area                                | Required review                                                                                                                                                   |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CM4            | Change dependency seeding           | Four scenarios require a metadata-only fallback that the aggregate-state helper no longer implements; current tests claiming that case actually provide locks.    |
| CM5            | Workspace/archive contracts         | Primary/singular workspace requirements conflict with the newer no-home-workspace archive contracts; metadata-port vocabulary is also stale.                      |
| CLI-S1, CLI-S2 | Change dependency command           | Two old output scenarios expect bare dependency IDs; the all-list delegation constraint conflicts with the query's required specId and intentional status branch. |
| CLI-I1, CLI-I2 | Init/help                           | Explicit default-valued flags still open the TTY wizard; several structured-output command leaves omit the required help schemas.                                 |
| CP1, CP2, CP3  | Spec validation                     | Stale optimizations do not independently fail validation; materialization warnings disappear; lock-less mismatch validation disagrees with the contract.          |
| CP4, CP5       | Metadata generation                 | Result-shape requirements have drifted; an explicit null lock observation can be associated with a later lock hash.                                               |
| CP6, CP7, CP8  | Composition/config/schema artifacts | Shared instance versus per-workspace map, configuration wording/error contradictions, and absent-artifact parsing exceptions need reconciliation.                 |

Total: **18 finding groups**, including **4 current implementation/diagnostic gaps** and **14 baseline/reconciliation groups**. Some groups contain multiple related clauses; this count is not a count of failed tests or individually failing scenarios. Severity is medium/low; no critical/high finding was established.

## Next action

Recommended: **Both** — `/specd-design support-commas-in-names` first to reconcile the intended contracts and decide treatment of baseline findings, then `/specd-implement support-commas-in-names` for implementation/test fixes. The active Full verification skill requires an explicit choice among Update Specs, Fix Implementation, Both or Proceed. No done/archivable transition, human approval or archive operation was performed.

## Detailed findings

The compiled report appends all four partial reports verbatim. Partial files and execution logs remain alongside it for traceability.
