# Partial F — CLI & skills (audit 20261019-114015)

## cli:change-validate

### Requirements Summary

Change-schema-sourced DAG/scopes; exit 3 + `fatal:` on unresolvable schema in all modes; identity mismatch keeps `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; resolver advisories rendered; batch/--all semantics; output formats.

### Implementation Status

- ✅ Schema resolution wrapper `resolveValidateSchema` (packages/cli/src/commands/change/validate.ts:221-236): identity mismatch -> `cliError(..., 3, 'SCHEMA_PROVIDER_IDENTITY_MISMATCH')`, other -> `SCHEMA_RESOLUTION_FAILED`, ChangeNotFound rethrown (exit 1).
- ✅ Single-spec mode resolves schema before core call (validate.ts:~400) and renders `formatSchemaAdvisories` (helpers/change-schema.ts); core-raised mismatch is mapped by handle-error.ts:180-190 to exit 3 with its own code.
- ✅ Batch: text `warnings:` block (validate.ts:~623), json `schemaWarnings` (validate.ts:~636).
- ✅ `--artifact` scope lookup uses change schema (validate.ts:337).
- ⚠️ Batch with zero specIds returns before schema resolution (validate.ts:~512) - no spec requirement covers it; LOW.

### Discrepancies

- LOW (spec-drift in scenario text): scenario "Unresolvable change schema exits with code 3" says `error:` message, but cliError prints `fatal:` for exit 3 (handle-error.ts:~39), which matches cli:entrypoint (spec.md:44) and the requirement text plus the sibling scenario ("stderr contains a `fatal:`"). Classification: spec wording drift in one scenario (should read `fatal:`); implementation is correct. Not an implementation bug.

### Test Coverage

- Unresolvable schema exit 3: covered (packages/cli/test/commands/change-validate.spec.ts:753; asserts exit 3 + message, not the `fatal:` prefix - weak on prefix but fatal prefix asserted at :799/:781).
- Single-spec exit 3 `fatal:`: covered (:799 core-raised mismatch -> exit 3 + `fatal:`; :781 resolver-raised).
- Identity mismatch code in json: covered (:781-796 stdout contains SCHEMA_PROVIDER_IDENTITY_MISMATCH).
- Version advisories rendered: covered (:815 text, :831 json schemaWarnings).
- Other pre-existing scenarios: covered (:59-727).

### Missing Tests

- None blocking. Optional: assert `fatal:` in :753 test.

### Summary

Requirements 12/12 compliant; scenarios covered; 1 LOW spec-wording drift.

## cli:change-spec-preview

### Requirements Summary

Merged/diff preview; `--artifact` resolved against the change's sovereign schema (ResolveChangeSchema), failures and `SchemaProviderIdentityMismatchError` reported as non-zero errors; warnings to stderr; error exits for unknown/non-spec/missing artifact.

### Implementation Status

- ✅ `--artifact` path resolves via `resolveChangeSchemaForCli` (packages/cli/src/commands/change/spec-preview.ts:~82-99); failure -> `cliError(..., 3, SCHEMA_PROVIDER_IDENTITY_MISMATCH | SCHEMA_RESOLUTION_FAILED)` (exit 3, per S11 design).
- ✅ Advisories: text mode written to stderr as `warnings:` block (~:131); json/toon include `schemaWarnings` (~:182).
- ✅ Unknown/non-spec/not-in-change artifact -> exit 1 `error:` (~:101-125).
- ⚠️ Without `--artifact`, schema resolution happens inside core PreviewSpec; resolver advisories are not surfaced and a core-raised mismatch goes through handle-error.ts:180-190 (exit 3, own code). Spec text does not require advisories there; design S11 only mentions the artifact path. LOW.

### Discrepancies

- LOW: advisories not rendered when no `--artifact` (spec silent; implementation matches design S11). Spec-gap rather than bug.

### Test Coverage

- --artifact resolves against change schema: covered (packages/cli/test/commands/change/spec-preview.spec.ts:416, :674 block).
- Identity mismatch reported: covered (spec-preview.spec.ts:704, code kept, exit 3); schema failure exit 3 fatal: covered (:675).
- Advisories on stderr: covered (:735).
- Existing scenarios (non-existent change :327, spec not in change :341, warnings stderr :361, unknown artifact :572, non-spec :602, not in change :636): covered.

### Missing Tests

- No test for mismatch surfaced without `--artifact` (core-raised path). LOW.

### Summary

All requirements compliant; 0 HIGH/MEDIUM; 1 LOW spec-gap, 1 LOW test gap.

## cli:change-artifacts

### Requirements Summary

Artifacts, order and `delta` flags come from the change's sovereign schema; default schema never consulted; schema resolution failures and identity mismatch must be errors with non-zero exit.

### Implementation Status

- ✅ Schema via `resolveChangeSchemaForCli` (packages/cli/src/commands/change/artifacts.ts:59); no `getActiveSchema` use.
- ✅ Advisories: text `warnings:` block (artifacts.ts:177), json `schemaWarnings` (:185).
- ⚠️ artifacts.ts:69-71 has a bare `catch { /* skip delta entries */ }` around `resolveChangeSchemaForCli`, which literally swallows resolution failures and identity mismatch (spec: "SHALL be reported as errors"). In practice the preceding `kernel.changes.status.execute` (core get-status.ts, constructed with ResolveChangeSchema) resolves the same schema first and throws, which handle-error.ts:180-190 maps to exit 3 with the identity code, so the user-visible requirement holds; the swallow is latent (only reachable if the second resolution diverges from the first).

### Discrepancies

- LOW (implementation, latent): silent catch contradicts the literal requirement and error-handling conventions (no swallowed errors). Fix: rethrow/cliError with exit 3 and codes like validate.ts:221-236. Spec is right; implementation is defensive but non-conforming in text.

### Test Coverage

- Listing follows change schema (delta metadata from change schema, not default): covered (packages/cli/test/commands/change-artifacts.spec.ts:265).
- Schema-declared order: covered (:96, :43).
- Advisories text/json: covered (:323, :334).
- Failure/identity-mismatch exit non-zero: missing (no test; only change-not-found exit 1 at :251). Requirement has no explicit scenario, so LOW.

### Missing Tests

- Schema-resolution failure / identity mismatch for `changes artifacts` exits non-zero. LOW.

### Summary

Requirements compliant in behaviour; 0 HIGH/MEDIUM; 1 LOW latent swallow, 1 LOW test gap.

## cli:change-status

### Requirements Summary

Lifecycle/check-derived projections from GetStatus only; pipeline in Core canonical order, `[optional]` annotation, disabled steps never re-added; DAG from change's sovereign schema (omitted + `SCHEMA_RESOLUTION_FAILED`/`SCHEMA_IDENTITY_MISMATCH` blocker when unresolved); `warnings:` section / `schemaWarnings` from GetStatus only, no stderr, exit 0; drift-aware states; validity/next-action; drafted read-only.

### Implementation Status

- ✅ Advisories only from `statusResult.schemaWarnings`: text (packages/cli/src/commands/change/status.ts:286-291), json (:164-166, :191, :444); no local drift computation, no stderr.
- ✅ DAG from change schema via `resolveChangeSchemaForCli` only when `lifecycle.schemaInfo !== null` (status.ts:235-237, :404-413); no `getActiveSchema`. Blocker codes `SCHEMA_IDENTITY_MISMATCH` / `SCHEMA_RESOLUTION_FAILED` are produced by core get-status.ts:386-397 and rendered through the generic blocker path.
- ✅ Pipeline: text `extras:` renders availableSteps verbatim with `[optional]` (status.ts:305-310); json exposes `optional` (:516-519). CLI neither sorts nor re-adds disabled steps.
- ✅ Remaining requirements (drift display, validity, overlap, drafted) unchanged by this change; existing tests pass-through.

### Discrepancies

- LOW: spec uses blocker code `SCHEMA_IDENTITY_MISMATCH` (status) while CLI error code elsewhere is `SCHEMA_PROVIDER_IDENTITY_MISMATCH`; they are different channels (GetStatus blocker vs thrown error code). Consistent with core get-status.ts:391; no action.

### Test Coverage

- Schema mismatch/advisory scenario: covered (packages/cli/test/commands/change/status.spec.ts:715 text, :741 json, :730 absent when none). Stderr-empty is implied (not asserted explicitly) - weak.
- DAG from change schema: covered (:752).
- Optional annotation: covered (:1527).
- Scenario "Pipeline follows canonical order and omits disabled steps" / "Pipeline display annotates optional steps and omits disabled steps": WEAK/MISSING at CLI level - no test uses a disabled step or non-canonical declared order (grep "disabled" in status.spec.ts: 0 hits; packages/cli/test/commands/helpers.ts only). Design test plan (design.md ~L1177, tasks group 44) lists "canonical order, disabled step absent" for status.spec.ts.
- DAG omitted + resolution blocker when schema unresolvable: missing at CLI level.
- Other scenarios (drift display, validity :1437, blockers :297/:324/:1613, drafted, overlap): covered.

### Missing Tests

- MEDIUM (test gap): CLI status test with `availableSteps` excluding a disabled step / canonical order, asserting the CLI does not re-add it.
- LOW: unresolvable-schema status renders blocker and omits DAG; explicit "no stderr warning" assertion.

### Summary

Implementation compliant. 0 implementation discrepancies; 1 MEDIUM test gap (disabled/canonical-order scenarios), 2 LOW.

## cli:change-transition

### Requirements Summary

`--next` passes `to: 'next'` to Core (no local table; disabled steps skipped by Core; enabled optional step stays the target, no shortcut evaluation); check progress rendering incl. `⊘ ... (skipped: reason)` for `outcome: 'skip'`; `Re-checking after hooks` only when a hook ran; repair guide, hooks, approval routing, etc.

### Implementation Status

- ✅ `--next` -> `'next'` (packages/cli/src/commands/change/transition.ts:372-373); no from-to table.
- ✅ Skip rendering with reason (`--skip-hooks`, `--skip-checks`, not applicable) and hidden duplicate re-check, labelled `Re-checking after hooks` once (packages/cli/src/commands/change/\_check-progress-presenter.ts:67-73, :125-157).
- ✅ Remaining requirements unchanged by this change.

### Discrepancies

- None HIGH/MEDIUM.
- LOW: "Next flag skips disabled step" is wholly Core behaviour; CLI evidence is the passthrough only.

### Test Coverage

- Next skips disabled step: weak (passthrough test packages/cli/test/commands/change/transition.spec.ts:82; Core owns behaviour).
- Next enters closest enabled optional step (no shortcut): covered (transition.spec.ts:108).
- Skipped hooks render as skipped / re-check only when hooks ran: covered (packages/cli/test/commands/change/check-progress-presenter.spec.ts:42-90).
- Gerund label/no `Executing:`: covered (transition.spec.ts:685); repair guide & bypass: covered (:748, :1509, :1541); `--next` failures: covered (:832-882); hooks flags: covered (:909-980); approval routing: covered (:207-435).

### Missing Tests

- LOW: CLI-level test for `--next` result when Core resolves past a disabled step (asserts nothing local intervenes).

### Summary

Compliant; 0 HIGH/MEDIUM; 2 LOW.

## skills:workflow-automation

### Requirements Summary

Plural canonical commands, toon for extraction, fresh-status-first routing from `nextAction`/`lifecycle.availableTransitions` (no hardcoded progressions, no skill-invented optional policy, no hooks for bypassed/disabled steps, explicit-target handling), approvals read from structured status, verify/compliance attempt ownership, strengthened template-protocol validator (real templates + installed copies; test-local routing functions not counted).

### Implementation Status

- ✅ Routed blocks use `<target>`/`<source>` placeholders in verify (packages/skills/templates/skills/specd-verify/SKILL.md.tpl:100-130, 255-260, 325-340, 368-390); explicit-target / stop-before-hooks rule at :44-57; verifying hooks only when advertised (:53, :95).
- ✅ Approvals: design (specd-design SKILL.md.tpl:454), verify (:395), implement (:85) all read `lifecycle.approvals` from a fresh toon status; no template reads approvals from text status (grep of templates).
- ✅ Validator (packages/skills/test/template-protocol.spec.ts:13-79): literal transition/hook states, fixed completion text, literal targets inside routed blocks, and text-approvals reads; runs over 4 lifecycle templates plus 5 installed copy roots (.claude/.agents/.codex/.github/.opencode); parity in generated-skill-protocol.spec.ts. Installed verify copies match template (all 5 contain the same lines).
- ⚠️ MEDIUM/LOW: verify template still states a fixed advancement chain in prose: SKILL.md.tpl:82-84 "(`implementing` -> `verifying` -> `done` -> `archivable`)" and :361-363 "transition through `done` and the signoff gate to reach `archivable`"; headings "6a. Transition to done"/"6b" are fixed. The validator's regexes (`changes transition <name> <state>`, `run-hooks <name> <state>`) cannot catch prose. Interpretation A (spec-drift/acceptable): the lines are descriptive, gated on user authorization and explicitly defer to the hop rules, and `done` is verify's declared completion hop. Interpretation B (implementation bug): spec says "Every transition instruction SHALL derive its target from fresh nextAction/availableTransitions" and the focus item "no fixed advancement sequence"; :361-363 is an instruction naming literal states. Recommend rewording to "advance along the target advertised by a fresh nextAction / availableTransitions" (the same prose in the other four installed copies would then need the regular sync, not done here).
- ⚠️ LOW: specd-new SKILL.md.tpl:148 keeps a state->action table (`ready` -> approve spec / `/specd-implement`); specd-new is outside the validator's four-skill scope and the spec's list.

### Discrepancies

- MEDIUM (borderline, see above): fixed lifecycle chain in verify prose (:82-84, :361-363) not detected by validator.
- LOW: validator only guards literal `<name> <state>` shapes; prose chains and `/specd-*` backward redirects are unchecked by design.

### Test Coverage

- Unconditional transition recipe / hooks for possibly-disabled step / fixed next-skill message fail validation: covered (packages/skills/test/template-protocol.spec.ts:82, :111, :125).
- Approval gating from structured status: covered (template-protocol.spec.ts:140; real templates :151).
- Current templates and installed copies pass: covered (:151-167, 5 copies x 4 skills).
- Routing tests exercise real templates: covered (template-workflow.spec.ts:340, :349; generated-skill-protocol.spec.ts:104, :119); no test-local routing function.
- Disabled verifying selects only actual target hooks / specd-verify skips verifying hooks: covered (template-workflow.spec.ts:340 string assertions; weak-semantic, phrase-level).
- Explicit design invocation/explicit target absent stop: covered (template-workflow.spec.ts:349, :309).
- Run: skills tests 53/53 pass; CLI tests (6 files) 159/159 pass.

### Missing Tests

- LOW: no validator rule for prose naming the fixed chain `verifying -> done -> archivable` (would have caught :83/:362).

### Summary

Most requirements compliant; 1 MEDIUM borderline (fixed chain in verify prose), 2 LOW.

## Cross-spec consistency (architecture/conventions/testing/error-handling)

- Error handling: CLI maps exit 3 consistently via cliError/handle-error; only artifacts.ts:69 has a swallowed catch (LOW). Shared helper `helpers/change-schema.ts` documents params and throws (JSDoc present). Tests colocated under packages/cli/test as per testing spec. No layer violations seen (CLI imports from `@specd/sdk`).

## Previous-audit failure confirmation

- Identity mismatch exit 3 + own code: resolved (validate.ts:221-236, spec-preview.ts:~88-95, handle-error.ts:180-190; tests validate :781/:799, spec-preview :704).
- Advisories rendered: resolved for validate (text/json, single + batch), spec-preview (--artifact only), artifacts, status.
- spec-preview --artifact schema failure exit 3: resolved (test :675).
- Skills approvals from toon: resolved. Strengthened validator: resolved. Verify fixed-sequence: partially (prose remnants, MEDIUM borderline).
- Known item `fatal:` vs `error:`: classified as scenario-text spec drift (LOW); code matches cli:entrypoint.

BATCH VERDICT: FAIL
(Reasons: MEDIUM test gap for cli:change-status disabled-step/canonical-order scenarios; MEDIUM borderline fixed chain prose in specd-verify template.)
