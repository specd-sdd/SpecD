# Round 7 partial audit, batch B (read-only)

Specs: core:transition-checks, core:transition-change, core:invalidate-change, core:archive-change (merged spec+verify via `changes spec-preview`).

Test run: `vitest run test/application/use-cases/{archive-change,transition-change,invalidate,reconcile}* test/application/{checks,services} test/domain/{services,checks}` in packages/core: 74 files, 1159 tests, 1159 passed, 0 failed.

## Round-6 items

| #   | Item                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | transition-change scenario "Transition from archiving to designing" | Body FIXED (spec lines 654-659: "artifact files are not marked pending review unless real drift or a reconciler verdict requires it"). Code has no artifact downgrade in `TransitionChange` (mutate applies only `invalidateSignoff` on skill hops + `transition`). Test `transition-change.spec.ts:2715` "transitions from archiving to designing without fabricating drift" agrees. LEFTOVER: the scenario TITLE still reads "...archiving to designing downgrades artifacts" (D1, LOW).                             |
| 2   | invalidate preview uses shared helper                               | FIXED. `previewArtifactReviewRequired` (`invalidate-change.ts:410-425`) calls `collectChangeReviewTargets` (`domain/services/change-validity.ts:219`), the same helper the reconciler uses (`reconcile-change-validity.ts:229`). Unit tests in `change-validity.spec.ts:407-490`; hash-only drift and pending-review under `none` previews are tested (`invalidate-change-ready-audit.spec.ts:267, 282`). Round-5 D5 is closed.                                                                                        |
| 3   | `@throws` JSDoc vs real throw sites                                 | PARTIAL, see D2-D5. TransitionChange and ArchiveChange lists cover every direct throw site; they omit errors propagated from `ResolveChangeSchema`, and ArchiveChange has one stale description and omits rethrown repository errors.                                                                                                                                                                                                                                                                                  |
| 4   | detect-impl-links-in-scope `>3 examples` tests                      | FIXED. `detect-impl-links-in-scope.spec.ts` has "lists every out-of-scope spec when there are at most three" (no `examples:`) and "compacts to three examples when more than three" (4 specs, `(examples: core:w, core:x, core:y)`, `core:z` absent). Code `detect-impl-links-in-scope.ts:44-52` matches the spec scenario "impl fail text stays a compact summary". `impl.filesResolved` has the same rule (`domain/checks/impl-files-resolved.ts:19-28`, tested in `transition-checks.spec.ts`).                     |
| 5   | Sweeps                                                              | No CLI strings in core: grep of `packages/core/src/{application,domain}` for `--skip-checks`, `--force`, `--allow*`, `Re-run with`, `specd <cmd>`, slash commands: 0 hits. `skipChecks` (use-case input) vs `skippedCheckIds`/"skipped check ids" (verdict input/spec prose) naming is consistent. Ready carve-out wording is consistent across transition-checks (lines 215, 299), transition-change (56), invalidate-change (60) with code (`change-validity.ts:195` `state !== 'ready'`). See D6, D7 for residuals. |

## Per-spec summary

### core:transition-checks

- Requirements: check identity/label/result, ABI (`WorkflowCheck`), one file per check, applicability from/to/along, dynamic runtime binding composition and cascaded config, archive-as-operation, phase/failure policy, predicate vs effect, evaluation and shared candidate evaluator, shared validity verdict/recovery priority, single reconciliation owner, registry bindings and governance categories, actionable diagnostics, host-neutral `impl.linksInScope`, check-declared actions, progress bus, projections, no shared snapshot bag, approval precedence and legacy parking bindings, verification currency bounds, check-owned structured details.
- Implementation: `application/checks/*` (one module per check id), `domain/services/transition-checks.ts`, `change-validity.ts`, `lifecycle-verdict.ts`, `workflow-check-registry.ts`. Matches; no CLI text in messages.
- Tests: `test/application/checks/*`, `test/domain/services/{transition-checks,change-validity,lifecycle-verdict}.spec.ts`, `test/application/services/detect-impl-links-in-scope.spec.ts`. All pass.

### core:transition-change

- Requirements: reconcile-first and stop as inapplicable after committed recovery, `to: 'next'` happy path, skip validation via `skipChecks` only, hook phases (`skipHookPhases` skips effects only), post-hook reconcile and predicate rerun, persistence via `ChangeRepository.mutate` (only sign-off invalidation on skill hops + transition + implementation tracking start).
- Implementation (`transition-change.ts`) matches: lines 211-258 (reconcile, recovery error, `HappyPathNextUnavailableError`), 296-346 (skip validation, candidate, predicate failures), 370-396 (post-hook rerun), 419-428 (mutate).
- Tests: `transition-change.spec.ts`, `-audit`, `-audit-2`, `-ready-audit`, `reconciled-transition-status`.

### core:invalidate-change

- Requirements: shape validation before mutation, schema resolution after load, force guard from reconciler pre-pass in one `mutate`, recovery preview under effective policy, `manual-invalidation` intent, ready carve-out, host-neutral errors.
- Implementation (`invalidate-change.ts:136-224`) matches. Redesign nuance in D7.
- Tests: `invalidate-change.spec.ts`, `-policy-audit`, `-ready-audit`, `-next-action`, composition spec.

### core:archive-change

- Requirements: reconcile-first, archivable/archiving guard, uniform `skipChecks`, named archive predicates (`failFastOn: schema.nameMatch`), overlap bypass invalidation, before/after-persist effects, post-hook reconcile and predicate rerun then `postHookValidityBlocksArchive`, snapshot/restore, link materialization, metadata regeneration.
- Implementation (`archive-change.ts:356-740`) matches the sequence. Throw sites: `ChangeNotFoundError` 361, `InvalidStateTransitionError` 384/487/510, recovery error 376/479, `ArchiveArtifactMissingError` 822/843, `ParserNotRegisteredError` 836/839/1234, `CheckPredicateFailedError` 1376/1392/1540 and `_assertArchiveDepsConsistent`, `ArchiveBatchRestoreError` 1138, `HookFailedError` via `throwHookFailed`.
- Tests: `archive-change.spec.ts`, `-audit`, `-links-audit`, `-skip-ids-audit`, `-batch-restore`, `-input`.

## Discrepancies

- **D1 (LOW, spec text): transition-change scenario title** "Transition from archiving to designing downgrades artifacts" (spec line 654) contradicts its own body and the code (no downgrade). Rename, e.g. "...does not fabricate drift". Code: `transition-change.ts:419-428`; test title `transition-change.spec.ts:2715` already says "without fabricating drift".
- **D2 (LOW, code JSDoc): `TransitionChange.execute` `@throws`** (lines 197-205) omits `SchemaProviderIdentityMismatchError`, propagated from `ResolveChangeSchema.execute` (`services/resolve-change-schema.ts:59`, called at transition-change.ts:226, 247). Sibling `ApproveSpec` documents it (`approve-spec.ts:75`) and ArchiveChange tests it (`archive-change.spec.ts:336`).
- **D3 (LOW, code JSDoc): `ArchiveChange.execute` `@throws`** (lines 343-354) likewise omits `SchemaProviderIdentityMismatchError` (called at 363). It also does not mention that `_prepareArchivePlan`/preflight/snapshot failures and commit/archive repository failures are rethrown as the original error after rollback (`archive-change.ts:535, 557, 573, 1130`); only `ArchiveBatchRestoreError` is listed. INFO-level completeness.
- **D4 (LOW, code JSDoc, inaccurate text): `_prepareSpecPublicationPreflight` `@throws {Error}`** (`archive-change.ts:981`) says "When metadata extraction and persisted dependency state conflict". There is no such throw. The only plain `Error` reachable is `resolveSealedArchiveDependsOn` ("ArchiveChange requires ContentHasher...", `resolve-sealed-archive-depends-on.ts:59`); the dependency disagreement is surfaced by `_assertArchiveDepsConsistent` as `CheckPredicateFailedError`. Fix the description.
- **D5 (LOW, code JSDoc): `InvalidateChange.execute` `@throws`** (lines 136-138) lists `ChangeNotFoundError`, `InvalidInvalidateTargetError`, `InvalidateRequiresForceError`, all real. It omits propagated `SchemaNotFoundError` (schema provider) and `SchemaProviderIdentityMismatchError` (`_resolveChangeSchema.execute`, line 164), which `ApproveSpec` documents. The constructor has no throw sites and no `@throws` (correct).
- **D6 (LOW, spec wording): CLI flag names in core specs.** transition-change line 188 and archive-change line 162 say "`--skip-hooks` / `skipHookPhases`" and "`--skip-hooks` skips effects only". The core contract is `skipHookPhases`; the flag is a CLI alias. Other bypass flags were already scrubbed (`--allow-*`, `--skip-checks` only appear in "MUST NOT contain" assertions). Suggest dropping the flag from core spec prose for consistency with the decoupling goal. Code has no CLI strings.
- **D7 (LOW, spec precision): invalidate-change line 60 / scenario "Forced revocation from ready under redesign returns to designing"** states redesign unconditionally returns a `ready` change to `designing`. Code (`change-validity.ts:195-203`) returns there only through the `workflow-redesign` rule, which also requires `artifactReviewRequired` (request marks a non-task artifact, or pre-existing drift/pending review). With `artifacts: 'none'`, no drift and force from `ready`, the change would stay in `ready`. The scenario's test (`invalidate-change-ready-audit.spec.ts:228`) uses `artifacts: 'surgical'`. Either qualify the spec ("with artifact review required") or confirm `validateCommandShape` forbids `redesign` + `none` (not verified).
- **D8 (INFO): grammar** `impl.filesResolved` message for one open file reads "1 open tracked file remain open" (`impl-files-resolved.ts:26`). Cosmetic.
- **D9 (INFO, carried): archive-change scenario "Archive discards nonexistent spec candidate"** wording ("fails before applying external updates" vs discard) unchanged since round 5.

No contradictions with project context or direct dependency specs found. Rounds 4-6 fixes re-checked (link materialization bypass, post-hook validity guard, invalidate preview parity, constructor `@throws`, skipChecks naming, ready carve-out): no regressions.

## Missing tests

- None required by spec. Optional: invalidate redesign + `artifacts: none` from `ready` without drift (D7); a test asserting `SchemaProviderIdentityMismatchError` propagates from `TransitionChange`/`InvalidateChange` (exists only for ArchiveChange).

## Counts

HIGH 0, MEDIUM 0, LOW 7 (D1-D7), INFO 2 (D8, D9). Tests 1159/1159 passed.
