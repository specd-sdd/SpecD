# Partial batch C (round 5): CLI lifecycle specs, error-handling conventions, skill templates

Scope: cli:change-status, cli:change-transition, cli:change-invalidate, cli:change-verification, cli:change-archive, cli:change-approve, default:\_global/error-handling-conventions, skills:skill-templates-source.
Method: merged spec-preview vs packages/cli/src (dist is current: no src newer than dist), packages/skills templates, tests. Read-only.

## Test results

- `pnpm --filter @specd/cli test`: 115 files, 1736 tests, 1736 passed, 0 failed.
- `pnpm --filter @specd/skills test`: 16 files, 183 tests, 183 passed, 0 failed.
- (Note: the `--reporter=json` args do not reach vitest through `pnpm test --`; totals taken from the vitest summary.)

## Counts

HIGH 0 / MEDIUM 0 / LOW 2 / INFO 5

## Round-4 items: re-verification (all FIXED)

1. transition (packages/cli/src/commands/change/transition.ts)
   - One `bypass:` per skippable blocker, deduped against the failed check: `writeTextRepairGuide` prints the failed CPFE's bypass, then loops blockers with `if (blocker.checkId === cpErr.checkId) continue`. Test transition.spec.ts ~2180-2193 asserts exactly 2 `bypass:` lines for 2 skippable + 1 non-skippable blockers.
   - CheckNotSkippableError: `checkNotSkippableHint` resolves CHECK_NOT_SKIPPABLE with `{checkId}` (hook.\* -> `--skip-hooks` hint). Text path writes it after `error:`; JSON path sets `hint`. Tests 2195-2220 (hook.pre has hint; protocol.edge / spec.overlap have none).
   - JSON/TOON record has `...structuredErrorField(err)` = `error:{code,message,checkId?}` in both the repair-guide branch and the reconciled branch; skippable CPFE sets `hint: skippableCheckHint(checkId)`. `--help` schema lists `error?: { code, message, checkId? }`, `hint?`, `state?`, `validity?`, `verification?`, blocker `bypassFlag`, `nextAction.{intent,action,guidance}`.
   - Reconciled text guide: `reconciledRepairGuideLines` (guidance-presenter.ts:385) prints per blocker label line, `check:`, `bypass:`, and the blocker action as `command:` or `guidance:`; then repair guide with state/return/target/command|guidance/reason. Covered by reconciled-blocked.spec.ts.
   - Per-phase --skip-hooks reason: `hookSkippedByFlag` in `_check-progress-presenter.ts` maps hook.pre -> target.pre (archive: pre) and hook.post -> source.post (archive: post); `all` skips both; otherwise falls back to the event reason. Tests: check-progress-presenter.spec.ts, reconciled-blocked.spec.ts:196-245.
2. approve: failure text order is `error:` (shared handler) then `state:`, `! CODE — label: message` blockers, `next action:`/`guidance:`/`reason:` (`handleErrorWithApprovalState`, approve.ts:161-197); tests approve-failure.spec.ts 155-175 assert ordering. `parseFormat` is the first statement in the try of both subcommands, before `approveSpec/approveSignoff.execute`; same in invalidate (`parseFormat` before `invalidate.execute`), verification (all three), archive (before `archive.execute`). Live: `--format bogus` exits 1 for transition/approve/invalidate/archive. Enrichment uses `Reflect.defineProperty` (read-only safe).
3. status --help: ran `change status --help`; every schema field line carries `// description` (grep for lines without `//` inside schema returns none) and status.spec.ts:2284 asserts `undescribed == []`. All spec-listed fields present (validity, verification, invalidation, implementationTracking, approvalGates, lifecycle.checks/checksByTarget, displayStatus, hasDrift, schema.artifactDag optional/hasTasks/output, lifecycle block incl. blockingArtifacts, review.overlapDetail, blocker + nextAction shapes, no isSkippable).
4. verification mismatch: `reportVerificationError` uses `cliError(message, ..., {hint, metadata})`; `cliError` writes `error:` then the hint, JSON carries `hint` + `metadata.differences`. No pre-error stderr write remains.
5. invalidate next action: `projectCliNextAction(rawNextAction, blockers)` (invalidate.ts:146) so the OVERLAP_CONFLICT bypass suffix applies; blockers projected via `projectCliBlocker` in json/toon, `blockerTextLines` adds label and `bypass:` in text. `--force` hint comes only from `force.revoke-consent` (no hard-coded sentence; grep for `Re-run with --force` finds only error-hints.ts).
6. docs: configuration.md:813 now "later than `ready`; in `ready` ... renewed there"; ADR 0028 has superseding "Update: spec consent in `ready`" plus inline pointer; cli-reference.md updated for nextAction intent, `--next` table, invalidate wording. See LOW-1/LOW-2 for residuals.
7. archive failure record vs spec: cli:change-archive requires for ReconciledOperationBlockedError that json/toon carry `state`, `automaticReturn`, projected blockers, projected `nextAction`; for other failures only "the structured error record with the error code and exit code 1" (via `handleError`). It does NOT require an `error` object in the archive reconciled record. Code (archive.ts:182-192) matches the spec. Decision: spec does not require it; transition now has it by explicit spec text (cli:change-transition "Invalid transition error"). Divergence between the two commands is INFO-1.

## Per-spec summary

### cli:change-status

- Requirements: active/drafted rendering, blocker projection (label, checkId, bypassFlag, no raw isSkippable), nextAction projected from intent/action via presenter, archive bypass hints from resolved bindings (`    bypass: --skip-checks <id>`, overlap reason suffix), complete `--help` schema.
- Implementation: matches (status.ts +320 lines; presenter in guidance-presenter.ts). Help verified live.
- Discrepancies: none.
- Tests: status.spec.ts (help completeness, drafted projection, bypass cases); all pass.
- Missing tests: none identified.

### cli:change-transition

- Requirements: signature/skip-checks/aliases, `--next` -> `to:'next'`, validity-aware repair guide, GetStatus with refresh false, no gate rewriting, hooks/progress bus, `complete` record, CPFE guide (code, label, hop, details, command/guidance, bypass per blocker), CheckNotSkippable hint, `error` object, blocker projection, check-progress rendering with skip markers and re-check heading.
- Implementation: all satisfied (see round-4 re-verification). `--help` lists the required failure-record fields.
- Discrepancies: none code-vs-spec. Non-blocking: hint forms differ by surface (transition guide `bypass:  Retry with --skip-checks <id> if an exception is granted` vs status `bypass: --skip-checks <id>`): both are specified, INFO-2.
- Tests: transition.spec.ts (bypass count, hint, error object, skip-hooks), check-progress-presenter.spec.ts, reconciled-blocked.spec.ts, cli-audit-round-2.spec.ts.
- Missing tests: bypass dedupe when two blockers share one checkId (INFO-3); TOON variant of the `error`/`hint` record (only JSON asserted).

### cli:change-invalidate

- Implementation matches: flags, policy parsing, force guard warning from `err.recoveries`, hint via `change.invalidate` context, blocker projection, `reason` named field, none-semantics text.
- Discrepancies: none. Tests: change-invalidate.spec.ts. Missing: explicit test that the overlap suffix appears in invalidate nextAction (only checked indirectly via presenter tests).

### cli:change-verification

- Implementation matches: start/complete/invalidate thin adapters, `parseFormat` before mutation, blocker projection with command omitted (never null) / guidance, nextAction `intent`/`action`/`guidance`, mismatch error then guidance.
- Discrepancies: none. Tests: verification.spec.ts pass.

### cli:change-archive

- Implementation matches: skip-checks/aliases, overlap text via `skippableCheckHint`, generic bypass for other skippable checks (`deps.consistent` skippable falls back to generic), non-skippable gets hint only, reconciled repair guide, per-phase `--skip-hooks` (pre/post).
- Discrepancies: none vs spec. Tests: archive.spec.ts, reconciled-blocked.spec.ts.

### cli:change-approve

- Implementation matches: only `{name, reason}` passed; success output includes `state:`; failure ordering, labelled blockers, `guidance:` line, read-only enrichment, help text states payload additions live under `metadata`.
- Discrepancies: none. Tests: approve.spec.ts, approve-failure.spec.ts.

### default:\_global/error-handling-conventions

- CLI side: hint rules exist for VERIFICATION_STALE, SPEC_NOT_INITIALIZED, DEPENDS_ON_OVERWRITE (now for every command), INVALIDATE_REQUIRES_FORCE, HAPPY_PATH_NEXT_UNAVAILABLE, deps.consistent (non-skippable only), CHECK_NOT_SKIPPABLE (hook.\*), generic `skippableCheckHint`. Spot grep of packages/core/src found no `--flag`/`specd <cmd>`/slash-command text in non-comment code (core batches own the full audit).
- Discrepancies: none in this batch's scope. INFO-4: INVALIDATE_REQUIRES_FORCE and IMPLEMENTATION_DETECTED hints are scoped to specific commands (`change.invalidate`; `change.draft`/`change.discard`); the spec asks the hint to apply to every command that can surface the code. Today those are the only surfacing commands, so compliant, but not future-proof like DEPENDS_ON_OVERWRITE.

### skills:skill-templates-source

- shared.md.tpl "Next Action engine" lists targetStep, actionType, reason, intent, action, command, guidance and the `command: null` + guidance rule (lines ~150-157). Templates for design/implement/verify/new mention OVERLAP_CONFLICT only as "archive-only" (not as a typical blocker) and the archive template tells agents the bypass applies only to live blockers and aliases are aliases. No discrepancy. Skills tests 183/183.

## Discrepancies (all)

- LOW-1: docs/cli/cli-reference.md:635 says archive prints the generic bypass "(or a check-specific bypass hint)". cli:change-archive and cli:change-transition require the hint to be identical in form for every skippable check and forbid check-specific variants. Spec is right; docs are wrong. Fix: drop the parenthetical.
- LOW-2: docs/cli/cli-reference.md transition option table (~lines 198-204) omits `--skip-checks <ids>` and `--allow-overlap`, and the transition section does not document the structured failure record (`error`, `hint`, `state`, `blockers`, `nextAction`). Code and `--help` are right; docs lag.
- INFO-1: transition failure records carry `error:{code,message,checkId?}`; archive reconciled failure record does not (spec only requires it for transition). Consider adding `error` to archive for machine-consumer parity, or leave as is.
- INFO-2: two textual bypass forms (guide sentence vs bypassFlag), both specified.
- INFO-3: text repair guide dedupes the failed check against blockers but not duplicate blocker checkIds among themselves; unlikely in practice.
- INFO-4: see error-handling-conventions note above.
- INFO-5: `enrichApprovalFailure` (approve.ts:216) builds a second CLI context/kernel after failure; harmless but redundant. Also `nextAction.intent` is emitted as explicit `null` in transition/verification records when absent, while status drafted results omit it (spec-consistent for each command).

## Missing tests

- TOON assertion for transition `error`/`hint` fields.
- Duplicate-checkId bypass dedupe (transition).
- Direct test that invalidate's displayed `nextAction.reason` carries the overlap bypass suffix.
