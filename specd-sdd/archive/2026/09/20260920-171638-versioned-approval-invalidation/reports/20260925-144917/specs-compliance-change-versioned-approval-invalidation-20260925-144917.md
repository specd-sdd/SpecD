# Specs compliance — versioned-approval-invalidation (attempt 8)

## Result and scope

**FAIL / incomplete verification.** Delegated audit for `verification-attempt-8`, initiated by full `/specd-verify`. The active attempt must not be completed or used to advance to `done`. The lifecycle was `verifying` at the start and remains there pending a decision on the corrections.

The package suites passed: Core 2,742 tests, CLI 945, skills 61, and code-graph 713. Passing tests do not resolve contradictory acceptance contracts or uncovered presentation paths. The graph was fresh. The current attempt captured 52 artifacts and 55 implementation files. No auditor started, completed, invalidated, approved, or transitioned the change.

This report consolidates confirmed findings, **not an exhaustive certification of every inherited scenario**. The delegated reviewers inspected the 25 change specs by assigned area but narrowed the final pass to confirmed discrepancies. Some large merged previews were truncated; no unread scenario is counted as passing. Project-wide context and relevant depth-one dependencies were loaded by the outer verification, but not individually certified end-to-end here. The complete evidence and limitations are retained in [\_partial-model.md](_partial-model.md), [\_partial-usecases.md](_partial-usecases.md), and [\_partial-cli-skills.md](_partial-cli-skills.md).

## Findings requiring artifact/contract review

| ID    | Severity | Contradiction                                                                                                                                                        | Recommended direction                                                                                |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M1    | Medium   | `core:change` requires a `designing → designing` event, while the entity rejects self-transition and the application treats it as no-op.                             | Decide the exact self-entry semantics; prefer neutral no-op with no event and test history.          |
| M2    | Medium   | `core:config` promises `ready → verifying` when implementing is omitted, whereas the fixed lifecycle topology and transition checks defer phase skipping.            | Remove the present-tense phase-skip claim.                                                           |
| M3    | High     | `core:schema-format` still mandates unconditional per-spec approval and an obsolete command, conflicting with optional change-level gates and whole-scope consent.   | Replace the old approval requirement and four scenarios with the current configurable gate contract. |
| M4    | Medium   | `core:change-repository-port` demands persisted post-save drift, while the new single-reconciler model reserves persistence/recovery for application reconciliation. | Specify non-writing hydration and test it separately from materialization.                           |
| U1    | Medium   | `core:get-status` retains a read-only constraint and unconditional `review.route=designing`, conflicting with operational reconciliation and ungated preserve.       | Qualify operational vs snapshot reads and route by gate/policy.                                      |
| U2    | Medium   | `core:validate-artifacts` still orders direct `Change.invalidate`, contrary to mandatory central reconciliation.                                                     | Remove the old call prescription; assert observable effects.                                         |
| U3    | Medium   | `core:archive-change` overlap scenarios require unconditional redesign/direct invalidation.                                                                          | Qualify by policy/gates and assert reconciler-owned recovery.                                        |
| U4    | Low      | `core:archive-change` factory scenario requires `RegenerateSpecMetadata`, while its merged requirement and factory use `MaterializeSpecMetadata`.                    | Update the stale scenario.                                                                           |
| U5    | Medium   | `core:edit-change` constructor contract still requires a repository map instead of `ListWorkspaces`; older text equates scope change with validity change.           | Align constructor and distinct output meanings.                                                      |
| U6    | Medium   | `core:transition-change` still describes clearing validated artifacts on verification retry, conflicting with the new preservation rule.                             | Remove or qualify residual clearing language.                                                        |
| CLI-3 | Medium   | `cli:change-verification` requires canonical next action after start/complete/invalidate, but Core results expose no such guidance for start/complete.               | Decide whether to add Core-owned guidance or narrow this scenario to invalidation.                   |

These are contract conflicts, not grounds to change working code blindly. In particular, restoring mandatory per-spec approval, direct invalidation, or automatic repository writes would reverse the agreed design.

## Findings requiring implementation/documentation work

| ID    | Severity | Confirmed gap                                                                                                                                     | Recommended direction                                                                                  |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| U7    | Medium   | `InvalidateVerification` returns no `/specd-verify` next action when stale evidence remains in ungated `archivable` or `archiving`.               | Derive guidance from the canonical verification boundary; test both states without lifecycle rollback. |
| U8    | Medium   | Config-based `CreateChange`/kernel ignores project invalidation-policy defaults when input omits policy.                                          | Inject resolved project defaults in Core composition; test nondefault config and explicit override.    |
| CLI-1 | Medium   | `changes edit` receives blockers/nextAction but drops them in text output; JSON/TOON include them.                                                | Render Core-owned fields in text and add preserve-mode format tests.                                   |
| CLI-2 | Medium   | Verification `start`, `complete`, and `invalidate` parse `--format` after invoking mutating use cases, contrary to the command documentation.     | Validate format before mutation; assert no use-case call for invalid format.                           |
| DOC-1 | Low      | `docs/cli/change-verification.md` says JSON/TOON return use-case fields unchanged, but the safe public presenter intentionally whitelists fields. | Describe the actual safe projection, not raw Core results.                                             |

The corrected `cli:change-invalidate` `--artifact-policy` scenarios were separately checked against code and targeted tests. They assert specific error code/message, so they do not pass merely because Commander rejects a removed option. A persistence/no-mutation assertion for those invalid-target cases remains useful test hardening, not a confirmed runtime defect.

## Verification disposition

At least the `core:change` self-entry event assertion and the `cli:change-edit` text-guidance assertion fail as written. Other inherited scenarios are contradictory or underspecified, so a complete scenario pass cannot honestly be declared. Exit hooks were not run as if the last scenario had passed. `verification-attempt-8` remains active and unfinished; the previous completed evidence remains stale. Before another completion, settle the contract decisions, correct artifacts and code as selected, restart the verification baseline if fingerprinted inputs change, and repeat full scenario verification and audit.

The appropriate work sequence, if both kinds of finding are accepted, is `/specd-design` first for the contracts, then `/specd-implement` for behavior/tests/docs. Full-mode protocol requires an explicit user choice before that routing; this report does not itself authorize lifecycle movement.
