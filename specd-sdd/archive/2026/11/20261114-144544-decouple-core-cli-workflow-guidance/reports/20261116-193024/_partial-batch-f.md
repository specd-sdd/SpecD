# Batch F audit: decouple-core-cli-workflow-guidance

Specs: default:\_global/error-handling-conventions, skills:skill-templates-source (+ project-wide specs check)

## 1. default:\_global/error-handling-conventions

### Requirements Summary

1. Specd Error Contract (Error, specd=true, code, message)
2. core Mandate (extend SpecdError)
3. Monorepo Package Mandate
4. Error Code Naming (UPPER_SNAKE_CASE)
5. Actionable Messaging
6. Host-Neutral Core Errors and Delivery Hints (CHANGED): no flags/`specd ...`/slash commands/use-case input names-as-bypass in core `message`; structured metadata; every code that relied on embedded recovery has a CLI hint
7. Host-Neutral Core Projections (CHANGED): NextAction/Blocker/CheckResult/validity have no delivery syntax; use intent/action/isSkippable/checkId; unknown kind falls back to `guidance`
8. Metadata Extraction, 9. JSDoc Documentation (unchanged; not the focus)

### Implementation Status

- Req 6: PARTIAL
  - OK: no `specd <group>`, `--force/--skip-checks/--next/--target/--allow-*`, `/specd-*`, `allowOutOfScope` literals anywhere in `packages/core/src` (grep over code and comments returned zero hits).
  - OK: `packages/core/src/application/errors/verification-stale-error.ts:23` message is host-neutral; CLI hint `VERIFICATION_STALE` -> `verification.renew` at `packages/cli/src/error-hints.ts:156-158`; test `packages/cli/test/error-hints.spec.ts:127-134`.
  - OK: hints for force/next/target/invalidate/deps rules at `error-hints.ts:107-169`, tests in `error-hints.spec.ts` and `handle-error.spec.ts`.
  - PARTIAL: `packages/core/src/domain/errors/depends-on-overwrite-error.ts:59` says "Pass force to overwrite curated dependencies." and `packages/core/src/application/errors/invalidate-requires-force-error.ts:31` says "Pass force to revoke the reported gate(s)". `force` is a use-case input name given as a bypass instruction (the spec's own example is `allowOutOfScope`). No `--` prefix, so it escapes every grep/test.
  - PARTIAL: `packages/core/src/domain/errors/spec-not-initialized-error.ts:10` message: `run "specs init" first` is CLI command syntax minus the `specd` prefix.
  - OK: metadata getters exposed (`existingDeps`, `incomingDeps`, `gates`, `state`, `specId`, `changeName`; tests `packages/core/test/domain/errors/host-neutral-errors.spec.ts:9-55`).
- Req 7: OK
  - `CheckAction` (`packages/core/src/domain/services/transition-checks.ts:88-97`) = kind/params/guidance, doc says guidance MUST NOT contain CLI syntax. `LifecycleActionIntent` used in `lifecycle-guidance.ts` (static test asserts no `/specd-`/`specd change(s)`).
  - CLI presenter `packages/cli/src/guidance-presenter.ts`: `INTENT_COMMANDS` (l.19), `resolveCliWorkflowCommand` (l.43-64), `resolveCliBypassFlag` (l.100+), `projectCliNextAction`; unknown kind -> command `null` + `guidance` field (l.67-81, 134-150).
  - MCP: `packages/mcp/src` has no nextAction mapping (spec only says MAY) - not a gap.
- Reqs 1-5, 8, 9: not touched by delta; not re-audited deeply. The deleted `archive-dependency-mismatch-error.ts` and `spec-overlap-error.ts` (git diff) removal is consistent with the contract (no dangling index export seen).

### Discrepancies

1. MEDIUM - `Pass force ...` in two core messages (files above). Either (a) code is wrong: reword to host-neutral text ("Overwrite requires explicit confirmation") and add CLI hints (hints already exist: `force.overwrite-deps`, `force.revoke-consent`); or (b) spec is too vague: spec lists `allowOutOfScope` as the example so "force" counts; if `force` is intended to be acceptable, spec should say bare input names that equal a generic concept are allowed. Code-side fix is the more consistent one.
2. LOW - `spec-not-initialized-error.ts:10` `run "specs init" first`. Same (a)/(b); CLI hint equivalent not verified to exist.
3. LOW - Enforcement tests too narrow: `host-neutral-projections.spec.ts:90-115` regex covers only `/specd-x`, `--skip-checks`, `--skip-hooks`, `--allow-`, `specd changes `, `specd specs `; it misses `--force`, `--next`, `--target`, `--set/--add/--remove/--clear`, `specd change ` (singular), `specd project/graph`, and input names (`force`, `allowOutOfScope`). That is why discrepancy 1 is undetected. Spec lists these tokens explicitly, so the test under-asserts the spec.
4. INFO - `reconciled-operation-blocked-error.ts:49` message embeds an intent/action token ("Follow the 'design' next action") - host-neutral, OK.

### Test Coverage

- Core message/flag absence: `host-neutral-errors.spec.ts` (5 errors), `validate-skip-checks.spec.ts:58`, `archive-change.spec.ts:4735-4751`, `get-status.spec.ts:1432,1802-1833`, `regenerate-spec-metadata.spec.ts:56`, `lifecycle-guidance.spec.ts:60-67`, `host-neutral-projections.spec.ts:59-115`.
- CLI hints: `error-hints.spec.ts` (incl. VERIFICATION_STALE), `handle-error.spec.ts`.
- Presenter: `guidance-presenter.spec.ts` (intent mapping, unknown kind -> null, guidance fallback, bypass flag, overlap suffix) covers "Unknown action kind falls back to guidance" and "Host translates structured guidance".
- Scenario map: Core error message omits flags - covered (narrow); Error with recovery has CLI hint - covered; CLI translates with command context - covered (`error-hints.spec.ts` command-scoped rules); Core projections omit syntax - covered; Host translates - covered (CLI only; MCP mapping untested, optional); Unknown kind - covered.

### Missing Tests

- No test that every core error code whose message used to embed recovery has a CLI hint (only VERIFICATION_STALE explicit). Requirement 6 sentence "Every core error code ... MUST have a matching CLI hint" is not enforced generically.
- No assertion that `Pass force`/input-name bypass text is absent from messages.
- No test for `SPEC_NOT_INITIALIZED` hint.

### Summary counts (changed reqs 6,7 + 5 scenarios audited)

OK 1 (Req 7), PARTIAL 1 (Req 6), MISSING 0; discrepancies: 1 medium, 2 low, 1 info; untested aspects: 3.

## 2. skills:skill-templates-source

### Requirements Summary

Change delta modifies only "In-place approval gates in workflow templates" (legacy parking states are drain entry states after consent; specd-new routing follows nextAction; specd-implement accepts pending-spec-approval) plus scenarios "New-skill routing table treats pending as drain only" (modified) and "Implement skill accepts pending-spec-approval after consent" (added). Other requirements unchanged (e.g., archive bypass, overlap).

### Implementation Status

- shared.md.tpl stay-in-ready/done, human `approve`, pending drain-only: OK (`packages/skills/templates/shared/shared.md.tpl` ~l.480-484; added "Approving in a drain state records consent without moving the change").
- specd-implement: OK. `SKILL.md.tpl` ~l.77-95: accepts `ready`, `pending-spec-approval`, `spec-approved`, `implementing`; without consent "stay in place", tell human `approve spec`, do not transition; with consent/gate off transitions.
  - Minor: wording "If in `ready`, `pending-spec-approval`, or `spec-approved` with spec gate off (or spec already approved)" - consistent with spec. `implementing` listed first-state check only; fine.
- specd-new routing rows: OK. `SKILL.md.tpl` ~l.150-155: `pending-signoff` / `pending-spec-approval` drain-only, approve command while consent is missing, otherwise follow `nextAction`. Spec also says "hop skill that nextAction names once consent recorded" - template says "follow `nextAction`": equivalent.
- specd-archive: OK. Archive template teaches `--skip-checks <checkId>` bypass, aliases, `bypass:` flag shown by status (`status.ts:278` renders `bypass:`), never-bypassable list (l.225-230); `SpecOverlapError` -> `OVERLAP_CONFLICT` rename (l.211) aligns with host-neutral codes.
- specd-design/verify/entry: OK, no pending-signoff / pending-spec-approval mentions (grep).
- Other requirements (metadata, frontmatter, graph terminology etc.): not touched by this change; spot-check unaffected.

### Discrepancies

1. LOW - Spec "Archive skill does not suggest bypassing a blocker without a flag" and unchanged text rely on `specd changes status` printing `bypass:`; status uses presenter `resolveCliBypassFlag` (`guidance-presenter.ts:100`), so consistent. No conflict.
2. LOW - Project spec architecture/other project-wide specs (9 listed via `project context`: architecture, conventions, error-handling-conventions, testing, docs, etc.): no contradiction found with the change; error-handling-conventions is itself changed and consistent except discrepancy 1 above.
3. INFO - specd-new row does not name "the hop skill" literally (spec wording); behaviorally same as following nextAction. Either tighten template or relax spec wording.

### Test Coverage

`packages/skills/test/template-workflow.spec.ts`:

- l.126-141: verify stays in `done`, no pending-signoff; implement contains `stay in place`, `pending-spec-approval`, `spec-approved`, `Do **not** \`transition implementing\``; shared `**stays**` and "Approving in a\ndrain state records consent without moving the change."
- l.161-163: archive `archiving`, no pending-signoff; l.223-259 overlap/bypass scenarios.
- Archive bypass scenarios covered at l.231-259.

### Missing Tests

- "New-skill routing table treats pending as drain only": no assertion found for the new row text ("while consent is missing; otherwise follow `nextAction`"); grep of the test file for the specd-new rows did not show a check (verify manually; possible gap).
- "Implement skill accepts pending-spec-approval after consent": test only checks substring presence (`pending-spec-approval`, `stay in place`), not that consent-recorded path transitions to `implementing` or that there is no-transition-without-consent branching; spec's own rule says phrase-only assertions are weak for contract tests.

### Summary counts (changed items: 1 requirement, 2 scenarios)

OK 3, PARTIAL 0, MISSING 0; discrepancies: 0 medium, 2 low, 1 info; test gaps: 2.

## Project-wide specs

No contradictions with the change's specs found. Note warnings: project-level and several global specs (architecture, conventions, error-handling-conventions, testing) have stale LLM-optimization; the `error-handling-conventions` optimized summary will be out of date after this change.
