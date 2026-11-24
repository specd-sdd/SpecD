# Partial batch C (round 8, verification-attempt-10) - read-only audit

Change: `decouple-core-cli-workflow-guidance`. Specs audited (merged via `changes spec-preview`, spec + verify): cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.

Test runs (vitest summaries):

- `pnpm --filter @specd/cli test`: Test Files 115 passed (115); Tests 1745 passed (1745); 0 failed.
- `pnpm --filter @specd/skills test`: Test Files 16 passed (16); Tests 183 passed (183); 0 failed.

## Findings (all severities)

| #   | Sev    | Where                                                                           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | MEDIUM | docs/cli/cli-reference.md:108 (not touched by any round)                        | Says a blocker "shows the flag `GetStatus` projected under it ... The CLI never builds a bypass of its own". Contradicts code and spec: Core carries only `isSkippable` + `checkId` (no `bypassFlag` anywhere in core/sdk src); the CLI presenter (`guidance-presenter.ts` `resolveCliBypassFlag`) builds `--skip-checks <checkId>`. Reword: "the CLI projects the flag from `isSkippable` + `checkId`, and never invents one when not skippable". |
| 2   | MEDIUM | docs/core/use-cases.md:194,195,197 (added this change)                          | Uses `predicateCode: 'APPROVAL_REQUIRED'` on `CheckPredicateFailedError`. No such property exists (`packages/core/src/domain/errors/check-predicate-failed-error.ts` exposes `checkCode` / `code`). Contradicts docs/core/errors.md in the same change, which correctly says `checkCode`.                                                                                                                                                          |
| 3   | LOW    | docs/core/use-cases.md:557 and :580 (ApproveSpec), ApproveSignoff table + prose | Say ApproveSpec requires state `ready` or `pending-spec-approval`, ApproveSignoff `done` or `pending-signoff`. Code uses `boundFromStates('approval.spec'/'approval.signoff')` (check-bindings.ts:106-125), which also include `spec-approved` and `signed-off`; cli:change-approve spec lists all three/three. Docs omit them.                                                                                                                    |
| 4   | LOW    | docs/core/use-cases.md ArchiveChange error table                                | `InvalidStateTransitionError: Change is not in archivable state`; `Change.isArchivable` accepts `archivable` and `archiving` (cli:change-archive requires both).                                                                                                                                                                                                                                                                                   |
| 5   | LOW    | docs/core/errors.md (CheckPredicateFailedError section)                         | `err.skippable: boolean` but the code is `skippable?: boolean`. Details payload list is incomplete vs code: `workflow.taskCompletion` also carries `byArtifact` (and `artifactId` in the `reason` branch), `spec.overlap` also `peers`, `workspace.readOnly` also `specIds`. `deps.consistent` shape `{mismatches:[{specId,extracted,persisted}],specIds}` is CORRECT (deps-consistent.ts:60-87).                                                  |
| 6   | LOW    | docs/core/custom-checks.md section 7 repair-guide sample                        | Real `writeTextRepairGuide` output differs: first line is `error: Check '<id>' failed: <check message>` (sample puts the code in the message slot); real output always appends `  reason:  <nextAction.reason>` after bypass (sample omits it). Order check/code/hop/(detail)/guidance                                                                                                                                                             | command/bypass/reason otherwise matches. |
| 7   | LOW    | docs/cli/cli-reference.md `--next` list                                         | "(and terminal states)" - no terminal states exist beyond `archivable`/`archiving` (nextWorkflowStep returns null only for those plus drain states without a forward exit). Harmless wording.                                                                                                                                                                                                                                                      |
| 8   | LOW    | docs/cli/change-verification.md:51-52 (+ approve/invalidate sections)           | Not updated for the new projected fields: invalidate JSON `nextAction` now carries `intent`/`action`/`guidance`; blockers carry `label`/`checkId`/`bypassFlag`/`action`/`command`; approve failure `metadata.{state,blockers,nextAction}`. Text still says only "Core's blockers ... next action". Incomplete, not contradictory.                                                                                                                  |
| 9   | LOW    | packages/cli/src/commands/change/transition.ts:550                              | JSON/TOON failure hint branch uses `err instanceof CheckPredicateFailedError` only; the text branch also accepts the `err.name` duck-typed fallback (lines 104-108, 220). Inconsistent across duplicated-module scenarios; no test or spec scenario hits it.                                                                                                                                                                                       |
| 10  | INFO   | status `--help` schema                                                          | `nextAction.intent` is listed as always present; drafted status omits `intent`/`action` (spec-compliant, but help does not say so). Top-level `availableTransitions`/`availableSteps` described as "legacy copy kept for compatibility" but are emitted only for drafted changes. Top-level `artifactDag[].state` described as "artifact state" (spec: drift-aware display state; code uses `displayStatus`).                                      |
| 11  | INFO   | core:invalidate-change (base specs/) / HistoricalImplementationGuardError JSDoc | JSDoc still says "Pass `force: true`" (comment only, message is clean; spec scopes the rule to `message`). Base `specs/core/change/spec.md:123,425` say stale spec consent "returns immediately to designing" without the `ready` exemption; merged previews of the change (core:change l.428, core:invalidate-change l.60, core:get-status l.205) do state the exemption, so no residual contradiction after merge.                               |
| 12  | INFO   | installed skill copies (.claude/.agents/.codex/.opencode)                       | Gitignored; not audited as deliverables. Templates are the source of truth and pass contract tests.                                                                                                                                                                                                                                                                                                                                                |

No HIGH findings. No code/spec discrepancy found in the six CLI commands, the error-handling spec, or the skills templates.

## Round-7 re-verification (against code, not wording)

- errors.md `checkCode` vs `CHECK_FAILED`: VERIFIED. `CheckPredicateFailedError.code` returns `checkCode`; `CHECK_FAILED` is only the use-case fallback (`transition-change.ts:515,529,537`, `archive-change.ts:1544`; test `archive-change.spec.ts:4882`). overview.md:107 and errors.md:972 table wording correct.
- `deps.consistent` details shape: VERIFIED against `domain/checks/deps-consistent.ts`.
- Drafted `nextAction` has `command: null` and no `intent`/`action` keys: VERIFIED (`status.ts:317-322`, JSON at :371; test status.spec.ts:1996). cli-reference.md:125 wording correct. Drafted blockers use `projectCliBlocker` (label/checkId/bypassFlag, no isSkippable), artifacts use display fallback, hop arrays empty, DAG omitted: VERIFIED.
- Ready recovery wording: VERIFIED against `selectAutomaticRecovery` (`change-validity.ts:195`: spec-approval recovery only when `isAfter(state,'designing') && state !== 'ready'`; workflow-redesign still applies from `ready`). docs ADR-0028, domain-model, use-cases:469, configuration.md:813, workflow.md, cli-reference.md:518 all consistent. Also consistent with VALID_TRANSITIONS tables in docs (domain-model, workflow.md).
- GetStatus `nextAction` intent/action description (use-cases.md:127): VERIFIED vs `NextAction` (get-status.ts:282, no `command`) and `lifecycle-guidance.ts:59` (`supersedesIntent === false ? phaseIntent : null`). custom-checks.md:77 matches.
- Repair-guide sample vs real CLI output: see finding 6 (minor drift).
- Force-hint-once test (`change-invalidate.spec.ts:735-745`): VERIFIED real. It uses a real `InvalidateRequiresForceError`, asserts the hint string occurs once and exactly one stderr line contains `--force`; implementation prints only a `warning: ... recovery target:` line plus the single hint from `handleError` (no hard-coded "Re-run with --force."). JSON-mode hint test at :662.

## Per-spec summary

### cli:change-status

- Requirements: 20 (signature, drafted read-only, output format/help schema, task completion in DAG, display-state, check-derived projections/pipeline/DAG from sovereign schema, reconciled validity + next action, review without file lists, labels, bypass hints, schema warnings, not found, schema-derived fields, refresh delegation, implementation section, task counts, basic info, specs+deps, stable display status).
- Implementation status: all implemented in `status.ts` + `guidance-presenter.ts`. Verified: `blockerTextLines` label + `    bypass:` lines; `projectCliBlocker` (no raw isSkippable) for active and drafted; `projectCliNextAction` with overlap suffix; JSON `nextAction` command/guidance/intent/action; drafted nextAction `{targetStep,actionType,reason,command:null}`; `schemaWarnings` text/JSON; DAG from `resolveChangeSchemaForCli`, `topologicalOrder`/`childrenOf`/`roots`, convergent nodes drawn once (`visited`); `[hasTasks - N/M done]`; `tasks: N/M`; display fallback `displayStatus ?? effectiveStatus ?? state`; review header without file lists; overlap peers; OVERLAP_CONFLICT hidden for spec-overlap-conflict.
- Discrepancies: none vs spec (finding 10 INFO only; docs finding 1).
- Test coverage: status.spec.ts has tests for every verify scenario incl. drafted (78,112,2120-2166,1996), labels (328,1176), bypass flags (1878-1918), gate action/intent-wins/guidance (1955-1982), help schema (68,2237,2248,2271), pipeline order/optional (1613,1658), DAG from change schema (756), convergent (2024), schema warnings (719-756,2054).
- Missing tests: none material. "Plugin archive check follows its resolved skippability" covered indirectly by 1878-1892 (generic), not by a plugin-id-specific case (LOW).

### cli:change-transition

- Requirements: 17. Implementation (`transition.ts`): mutually exclusive step/--next usage errors; `--skip-checks` + `--allow-out-of-scope`/`--allow-overlap` aliases deduped into `skipChecks`; `to:'next'` passthrough; pre/repair `GetStatus` with `refreshImplementationTracking:false`; no approval flags; check bus progress; success/failure `complete` records; CPFE repair guide with label/code/hop/details/command|guidance/bypass/hint; per-blocker bypass lines (dedup by checkId); guidance + next-action command both shown; `CheckNotSkippableError` hint (hook -> `--skip-hooks`); structured failure `error{code,message,checkId}`, projected blockers, `nextAction` record, `hint`, `state`, validity/verification; ReconciledOperationBlockedError repair guide (text) and `state/automaticReturn/blockers/nextAction` (json/toon).
- Discrepancies: none (finding 9 LOW, 7 LOW docs).
- Test coverage: transition.spec.ts (skip-checks 1504-1850, repair guide 1613-1791, 1928-2319 incl. guidance-only, both lines, diagnostic code, projected blockers, per-blocker bypass, deps.consistent hints, help schema 2211/2319) + reconciled-blocked.spec.ts (text/json/bypass/help/skip-hooks).
- Missing tests: none material.

### cli:change-invalidate

- Requirements: 12. Implementation (`invalidate.ts`): flags map to `InvalidateChange`, override-only policy, target parsing (`artifact`, `artifact@spec`), reason, `--force`; text/JSON reporting with named `reason`, effective policy, affected, projection changes, automatic return, blockers via presenter (label, bypass line; JSON projected), next action via presenter; refusal warns per `recoveries` target and the only `--force` text is the resolved hint (rule `INVALIDATE_REQUIRES_FORCE` for `change.invalidate`); `--target` hint for `INVALID_INVALIDATE_TARGET`/`INVALID_INPUT`.
- Discrepancies: none. (Hints for `INVALIDATE_REQUIRES_FORCE`/`INVALID_INVALIDATE_TARGET` are scoped to `change.invalidate`, the only command that can raise them - satisfies the "every command that can surface" rule.)
- Test coverage: change-invalidate.spec.ts (hints 692-745, guidance line 747, JSON hint 662, force pass-through 259/597).
- Missing tests: none material.

### cli:change-verification

- Requirements: 6. Implementation (`verification.ts`): `parseFormat` before any use case (all three), empty reason rejected before core, safe whitelisted start/complete projections (no nextAction), invalidate: `invalidated`, persisted `reason`, `signoffChanged`, `automaticReturn`, blockers via `projectCliBlocker` + presenter `command` (omitted, never null) + `guidance`, `nextAction` with command/guidance/intent/action; mismatch hint recommends start + repeat + complete; validity blockers whitelisted to code/message.
- Discrepancies: none.
- Test coverage: verification.spec.ts (invalid format 170-182, empty reason 146, blocker action/omitted command 571, overlap suffix 414, intent/action ~294-370, error path 525/554).
- Missing tests: none material.

### cli:change-archive

- Requirements: 12. Implementation (`archive.ts`): `--skip-checks` repeatable/comma list trimmed/deduped, aliases translated, no CLI skippability validation; delegates state guard; check bus with effective `skipHooks`; CPFE text path (overlap entries + generic bypass hint via `skippableCheckHint`, other checks with check/label/hop/details/command|guidance/bypass|hint); ReconciledOperationBlocked repair guide / structured record; post-hook failure exit 2; NDJSON `change-archive` complete record; `invalidatedChanges` text/JSON.
- Discrepancies: none.
- Test coverage: archive.spec.ts (flags 445-521, errors 536-786, progress 829-958, invalidated 190-215, 801) + reconciled-blocked.spec.ts (archive variant).
- Missing tests: none material.

### cli:change-approve

- Requirements: 8. Implementation (`approve.ts`): only `{name, reason}`; `kernel.changes.*`; format validated before mutation; success `state:` line/field unchanged; evidence summary without hashes; failure: error line first, then `state:`, labelled blockers + bypass, next action + `guidance:` + reason; enrichment via `Reflect.defineProperty` (getter-only/frozen safe); help documents metadata-nested additions and full blocker/nextAction shapes.
- Discrepancies: none.
- Test coverage: approve.spec.ts + approve-failure.spec.ts (ordering 133/167, getter-only 214, frozen 254, projection 98/171/250, drain-state 112/373).
- Missing tests: none material.

### default:\_global/error-handling-conventions

- Requirements: 10 (contract, core mandate, package mandate, code naming, actionable messages, host-neutral errors + hints, host-neutral projections, metadata, JSDoc). Implementation: sweep of non-comment `packages/core/src` for `--flag`, `/specd-*`, `specd <cmd>`, `Pass force`, `without force`, `allowOutOfScope`, `skipChecks` in strings found nothing; `HistoricalImplementationGuardError` message reworded ("without explicit confirmation"); `NextAction`/`Blocker` carry `intent`/`action`/`isSkippable`/`checkId` only; hints exist for `VERIFICATION_STALE`, `SPEC_NOT_INITIALIZED`, `INVALIDATE_REQUIRES_FORCE`, `IMPLEMENTATION_DETECTED`, `DEPENDS_ON_OVERWRITE` (all commands via catch-all rule), `HAPPY_PATH_NEXT_UNAVAILABLE`, `CHECK_NOT_SKIPPABLE`, deps.consistent.
- Discrepancies: none (finding 11 INFO).
- Test coverage: error-hints.spec.ts, handle-error.spec.ts, guidance-presenter.spec.ts, core error specs.
- Missing tests: none identified.

### skills:skill-templates-source

- Requirements: ~25 (layout, metadata, rendering, graph terminology, snippets, frontmatter, tracking, metadata self-healing, optimizer gating, command roles, in-place approval gates, reconciled protocol, overlap vs live overlap, fast-track, archive hooks, design review scope). Implementation checked this round: shared "Next Action engine" lists `targetStep, actionType, reason, intent, action, command, guidance` and the `command: null` + guidance rule (shared.md.tpl:144-160); archive template teaches `--skip-checks <checkId>` from status, aliases only as aliases, names workspace.readOnly/impl.filesResolved/deps.consistent as never bypassable, reserves OVERLAP_CONFLICT for live overlap; design/implement/verify/new mark OVERLAP_CONFLICT archive-only and never bypassed for `spec-overlap-conflict`; no pending-state hop copy in archive/verify/design/specd templates.
- Discrepancies: none.
- Test coverage: skills tests 183/183 pass (template-lifecycle-consent.spec.ts:32-43 asserts the nextAction fields and "MUST follow `guidance`"; template-workflow.spec.ts:235-252 asserts overlap/bypass copy).
- Missing tests: none material.

## Counts

- HIGH 0, MEDIUM 2 (findings 1-2), LOW 7 (3-9), INFO 3 (10-12).
- Requirements audited both directions: status 20, transition 17, invalidate 12, verification 6, archive 12, approve 8, error-handling 10, skills ~25.
- Round 4-8 regression sweep (docs/core, docs/cli, docs/guide, docs/adr, merged specs): no regression of old flags in core messages, `command:` for guidance-only, bypassFlag in core blockers, isSkippable on JSON blockers, `intent` on drafted status, or spec-consent recovery wording; only the doc inaccuracies listed above.
