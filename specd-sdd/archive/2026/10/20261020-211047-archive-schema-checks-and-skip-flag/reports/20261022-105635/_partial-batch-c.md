# Partial audit batch C: cli:change-archive, cli:change-status, core:get-status

Change: archive-schema-checks-and-skip-flag. Implementation: uncommitted working tree. Audit date 2026-10-22. Read-only.

Key files: packages/cli/src/commands/change/archive.ts, packages/cli/src/commands/change/status.ts, packages/core/src/application/use-cases/get-status.ts, packages/core/src/domain/errors/spec-overlap-error.ts, packages/core/src/application/use-cases/archive-change.ts (~L1504). Tests: packages/cli/test/commands/change/archive.spec.ts, packages/cli/test/commands/change/status.spec.ts (L1736-1840), packages/core/test/application/use-cases/get-status.spec.ts (L1390-1470, L1740-1900).

Note: graph index not used (known stale); direct file reads. Tests were read, not executed.

---

## 1. cli:change-archive

### Requirements Summary

Command signature with `--skip-checks <ids>` (repeatable, comma-separated), `--allow-overlap` and `--allow-out-of-scope` aliases, `--skip-hooks`. CLI only translates to `ArchiveChangeInput.skipChecks` and does not validate skippability. Prerequisites delegated to ArchiveChange. Check progress rendering (gerund labels, no `Executing:`). Post-hook failure exits 2. Output on success text/json, invalidatedChanges. Error cases: unknown check, non-skippable/hook check, CheckPredicateFailedError with conditional `bypass:` line, SpecOverlapError with a `Use --skip-checks spec.overlap...` line only when skippable. Canonical naming.

### Implementation Status

| Requirement                                 | Status                                              | Evidence                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature / flags                   | Implemented                                         | archive.ts L66-79 options; comma split + trim + filter(Boolean) into a Set (dedup, case-sensitive); aliases add `impl.linksInScope` / `spec.overlap`; only `skipChecks` (omitted when empty) plus `skipHookPhases` passed. No local skippability validation. |
| `--skip-checks` with no value = usage error | Implemented                                         | commander required-arg option                                                                                                                                                                                                                                |
| Prerequisites (no CLI state table)          | Implemented                                         | none in CLI; delegated                                                                                                                                                                                                                                       |
| Behaviour / hooks                           | Implemented                                         | skipHookPhases forwarded                                                                                                                                                                                                                                     |
| Check progress rendering                    | Implemented                                         | `_check-progress-presenter` (not re-audited here; `skipChecks` set passed so skipped checks are shown)                                                                                                                                                       |
| Post-archive hooks exit 2                   | Implemented                                         | `cliError(..., 2)`                                                                                                                                                                                                                                           |
| Output on success (text/json, extended)     | Implemented                                         | `archived change X → path`, `invalidated N overlapping changes:` section, NDJSON complete record                                                                                                                                                             |
| Error cases: unknown/non-skippable/hook     | Implemented via `handleError` (core errors)         |                                                                                                                                                                                                                                                              |
| CheckPredicateFailedError bypass line       | Implemented                                         | archive.ts: `bypass:  Retry with --skip-checks <id> if an exception is granted` only when `err.skippable === true`; text mode only; json goes to handleError                                                                                                 |
| SpecOverlapError hint                       | Implemented                                         | hint composed in CLI only when `err.skippable` (new neutral message in core); ends with `Use --skip-checks spec.overlap to proceed despite overlap.`                                                                                                         |
| Canonical naming                            | Implemented (parent registration, not in this file) |                                                                                                                                                                                                                                                              |

### Discrepancies

1. LOW, spec-wrong or code-wrong: the spec says "ending with `Use --skip-checks spec.overlap to proceed despite overlap.`". Implementation emits a trailing blank-line-separated sentence followed by `\n`. Consistent in substance; no action.
2. LOW, code gap (pre-existing behaviour): `SpecOverlapError` is always rendered as text on stderr and exits 1 even with `--format json|toon`. The spec only requires the hint text; the structured-error scenario is only specified for CheckNotSkippable / plugin failure. If a structured error record is wanted for overlap, spec should say so. Possible spec gap.
3. LOW, spec ambiguity: spec says "(`UnknownCheckError`) exits with code 1" and "Hook check ... message points to `--skip-hooks`": relies on core (core:archive-change batch), not CLI-verifiable here; CLI test only asserts that message (see tests).
4. INFO: text-mode `bypass:` line for CheckPredicateFailedError is printed to stderr, spec says "prints" (unspecified stream). Fine.
5. INFO: `SpecOverlapError.message` is now neutral. The CLI no longer prints `err.message`; it builds its own list. Consistent with spec; verify no other consumer (MCP, other CLI command) relied on the old message flag text (outside this batch).

### Test Coverage (archive.spec.ts)

Covered: missing name, skip-hooks (all/pre/post/pre,post/default), alias translation (both), omit skipChecks when none, comma list, repeatable, trim/empty, blank value omitted, duplicates collapse, case-sensitive forward, singular alias, combine skip-hooks + skip-checks, `--skip-checks` without value rejected with no execute, --help lists flags and alias text, unknown check id, hook check -> `--skip-hooks` pointer, non-skippable (also via alias), structured error in json, overlap hint when skippable, no hint when not skippable (neither `--skip-checks` nor `--allow-overlap`), plugin failure bypass line when skippable / none when not / json record, invalid-state with skip flag, invalidated peers with `--skip-checks spec.overlap`, progress rendering with gerund and no `Executing:`, archiving-state forward, not-archivable, post-hook exit 2, JSON stream.

### Missing / Weak Tests

- WEAK: "Hook progress rides the same bus" (`Running pre hooks`, id `hook.pre`, streamed lines before check-done): not seen in archive.spec.ts test names; may be covered in the presenter spec (not checked).
- WEAK: "CLI does not validate skippability itself" (`workspace.readOnly` forwarded): the non-skippable test mocks the use case rejection; no explicit assertion that the id is forwarded unchanged (partially covered by case-sensitive forward test).
- WEAK: "Overlap: stderr lists peers and ends with"; test asserts `toContain`, not "ends with". Minor.
- Missing: SpecOverlapError with `--format json` behaviour (unspecified, see Discrepancy 2).
- Missing: Alias for non-skippable `impl.linksInScope` is covered ("also through an alias").

### Spec Dependency Chain

- cli:entrypoint, core:change, core:archive-change, core:hook-execution-model, cli:command-resource-naming, core:transition-checks. Consistent with the others as far as read: the cli spec requires `ArchiveChangeInput.skipChecks` as the sole bypass field; the code matches. core:archive-change is in another batch (confirm it declares `skipChecks` and the `SpecOverlapError.skippable` contract; core code does). Project-wide specs: architecture (CLI is a thin adapter: complies, no skippability logic in CLI), error-handling (typed errors with codes, CLI maps via handleError: complies, SpecOverlapError exposes `code` SPEC_OVERLAP and a structured `skippable` property rather than embedding delivery text: improvement), testing (unit tests with mocked kernel: complies).

### Summary counts

Requirements 12; implemented 12; discrepancies 0 high, 0 medium, 2 low, 3 info; weak tests 3; missing tests 1 (spec-undefined).

---

## 2. cli:change-status

### Requirements Summary

Many pre-existing requirements (drafted read-only, DAG, display state, lifecycle projections, review text, blockers with labels, schema warnings, etc.). This change's delta: Requirement "Archive bypass hints come from resolved bindings": the CLI renders `bypassFlag` exactly as supplied by GetStatus; never builds, adds or removes; no flag for non-skippable (locked built-in or schema-hardened); next-action reason ends with `Use --skip-checks spec.overlap to archive anyway.` unless the message already contains it; JSON/TOON carry `bypassFlag` exactly when text shows one. Also `Text blockers include check labels` shape.

### Implementation Status

| Requirement (change-relevant)                      | Status                                                                           | Evidence                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive bypass hints render                        | Implemented                                                                      | status.ts ~L267-273: after each blocker line pushes `    bypass: ${b.bypassFlag}` only if defined; comment states CLI never builds one                                                                                                                                                                                      |
| Structured output includes `bypassFlag`            | Implemented                                                                      | status.ts ~L455 maps `bypassFlag` into blockers for json/toon                                                                                                                                                                                                                                                               |
| next-action reason with/without hint               | Delegated to core (see core:get-status); CLI prints `nextAction.reason` as given |                                                                                                                                                                                                                                                                                                                             |
| Text blockers with labels                          | Implemented                                                                      | `! CODE — label: message` / `! CODE: message`                                                                                                                                                                                                                                                                               |
| Overlap invalidation not shown as OVERLAP_CONFLICT | Implemented                                                                      | `textBlockers` filter when `review.reason === 'spec-overlap-conflict'`. NOTE: this filter also removes a LIVE `OVERLAP_CONFLICT` blocker (archivable) if review.reason happens to be `spec-overlap-conflict`; core spec says invalidation overlap never adds the blocker, so such co-occurrence should not arise; low risk. |

Other pre-existing requirements were not re-audited in depth in this pass (unchanged files outside the diff).

### Discrepancies

1. MEDIUM, spec gap: the spec does not define the textual shape of the bypass line (`    bypass: <flag>` under the blocker). Spec says only "shows the bypass flag". Docs (docs/cli/cli-reference.md) now show a `bypass:` example. Suggest recording the shape in the spec or leaving it to docs; either is acceptable.
2. LOW, spec-wrong candidate: scenario "Locked check shows no bypass ... in text, JSON, or TOON" and "Several archive blockers each carry their own flag": satisfied by delegation; the CLI test uses mocked GetStatus, so integration correctness depends entirely on core:get-status (covered there).
3. LOW: text mode prints blocker `bypass:` for every blocker including non-archive ones (e.g. `IMPLEMENTATION_STATE` on `implementing -> verifying`, flag `--skip-checks impl.linksInScope`, accepted by `changes transition`, not `changes archive`). The spec requirement title is about archive blockers, but the "CLI renders as provided" rule is generic; the spec statement "always `--skip-checks <checkId>`, which `changes archive` accepts" is only true for archive blockers. Minor spec wording inaccuracy (spec-wrong, since transition blockers carry the same flag form and `changes transition --skip-checks` accepts them).

### Test Coverage (status.spec.ts L1736-1840)

Covered: text shows projected flag; each skippable blocker has its own flag and locked has none (2 `bypass:` lines); CLI adds nothing when absent and does not print `--skip-checks` (incl. reason without hint); json and toon include same hints (`bypassFlag` present for overlap, undefined for readOnly); disabled overlap shows none.

### Missing / Weak Tests

- WEAK: scenario "next-action reason ends with `Use --skip-checks spec.overlap to archive anyway.`": only the core test checks this; CLI test passes a literal reason. Acceptable.
- Missing: scenario "The shown flag is accepted by changes archive" (cross-command contract). No test asserts that the flag string from status is parseable by the archive command (could be a small contract test, e.g. parse `--skip-checks spec.overlap` in archive spec: effectively covered by archive tests passing the same literal).
- Missing: scenario "Plugin archive check follows its resolved skippability" at CLI level: only core.
- Missing: scenario "A hardened archive blocker mixed with a skippable one" (workspace.readOnly + spec.overlap): covered effectively by 'gives every skippable blocker its own flag and none to a locked one'.
- Missing: `--help` JSON schema documentation of `bypassFlag` in blockers (not required by spec text; not verified).

### Spec Dependency Chain

- cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks, core:lifecycle-engine, core:resolve-change-schema. The change delta depends on core:get-status (consistent: `bypassFlag` semantics match) and core:transition-checks (effective bindings). Project-wide: architecture OK (no local recomputation), error-handling n/a, testing OK (mocked kernel).

### Summary counts

Change-relevant requirements 1 (+1 label requirement); implemented 2; discrepancies 0 high, 1 medium (spec gap), 2 low; weak tests 1; missing tests 3 (low).

---

## 3. core:get-status

### Requirements Summary

Change-relevant delta: (a) "Execute matching predicates then project": archivable status executes archive-scope predicates from the EFFECTIVE archive bindings (`resolveEffectiveBindings` operation `archive`, including schema `archiveChecks`; skipChecks empty; disabled check not evaluated; bypassFlag only for a skippable resolved archive binding); (b) "Identifies blockers": `isSkippable`/`bypassFlag` only from the resolved binding for the evaluated candidate; `IMPLEMENTATION_STATE` only `impl.linksInScope` skippable, `impl.filesResolved` not; label/checkId; (c) OVERLAP_CONFLICT nextAction stays `/specd-archive` targetStep `archivable`, reason is not `Ready to archive` and "MUST name live overlap and the projected bypass flag". Remaining requirements pre-existing.

### Implementation Status

| Requirement                                                      | Status                                   | Evidence                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Archive predicates use effective bindings, empty skipChecks      | Implemented                              | get-status.ts ~L646-670: `resolveEffectiveBindings({ baseBindings: this._archiveBindings, schema, operation: 'archive', registry? })` only when `archivable`; evaluated via `executeMatchingPredicates` with the effective set |
| Disabled check not evaluated                                     | Implemented via resolveEffectiveBindings | test 'produces no overlap blocker when the schema disables spec.overlap'                                                                                                                                                       |
| Archive blockers judged by archive binding only                  | Implemented                              | `_mergeBlockers` separates `transitionSkippable` / `archiveSkippable` maps by source; the verdict-precomputed bypass for review blockers is overridden by archive result first, then transition result                         |
| bypassFlag only when skippable; format `--skip-checks <checkId>` | Implemented                              | `_mergeBlockers`                                                                                                                                                                                                               |
| impl.filesResolved vs impl.linksInScope                          | Implemented                              | per-check id lookup (pre-existing tests L730-893)                                                                                                                                                                              |
| nextAction after OVERLAP                                         | Implemented                              | `_nextActionAfterArchiveOverlap`: only appends `Use <flag> to archive anyway.` when `bypassFlag` defined and message lacks it; never invents `--skip-checks spec.overlap`                                                      |
| Other requirements                                               | Not changed; not re-audited in depth     |                                                                                                                                                                                                                                |

### Discrepancies

1. MEDIUM, spec internal inconsistency (spec-wrong): core:get-status states `nextAction.reason` "MUST name live overlap and the projected bypass flag (`--skip-checks spec.overlap`)" unconditionally, while cli:change-status and the implementation correctly omit the flag when `spec.overlap` is not skippable (test 'shows the overlap blocker without a flag or hint when the schema makes it non-skippable' asserts no `--skip-checks` in the reason). Recommend editing the core spec to say "and, when the resolved binding is skippable, the projected bypass flag". Code is right.
2. MEDIUM, spec gap: the verify.md scenario "Archivable live overlap does not advertise Ready to archive" requires the reason to name `--skip-checks spec.overlap` (skippable case only is covered; the non-skippable case is in "Schema-hardened overlap carries no bypass flag" scenario which does not assert the reason). Add `AND nextAction.reason does not suggest a bypass` to that scenario. Implementation and test already do.
3. LOW, spec-wrong: the "Constructor dependencies" / `resolveGetStatusDeps` requirement does not mention the optional `checkRegistry` that `GetStatus` now uses (`this._checkRegistry` passed to `resolveEffectiveBindings`). Confirm the registry is resolved by `resolveGetStatusDeps` and that spec lists it (code branch `registry` is optional; if absent, schema-embedded/plugin checks in `archiveChecks` would not resolve in status, causing a status/archive mismatch). Not verified in the composition layer within this batch; flagged for cross-check with composition tests (workflow-check-registry.spec.ts is modified in the working tree).
4. LOW, code risk: `_mergeBlockers` default parameter `archiveBindings = this._archiveBindings` means any caller omitting the param silently reverts to base (non-effective) bindings. Only one call site in this file passes it; acceptable but fragile.
5. LOW: transition-source and archive-source `isSkippable` merging uses `OR` across targets for transition candidates (`(prev ?? false) || skippable`): a check failing on several candidate targets is advertised as skippable if any target allows it, though the bypass applies per transition. Pre-existing semantics; spec says "resolved binding of that check for the evaluated candidate". Possible code-wrong for multi-target cases (blocker dedup key is code+message, so one blocker covers several targets). Low.
6. INFO: `review` blockers' pre-computed `bypassFlag` from the lifecycle verdict is retained when no check match exists (`resolved === undefined`). Spec says resolved bindings are authoritative; fallback is only for blockers without checkId. Fine.

### Test Coverage (get-status.spec.ts)

Covered: live overlap on archivable with skippable flag and nextAction (L1390); no OVERLAP when not archivable; skippable overlap flag + reason contains it; disabled spec.overlap -> no blocker; schema-hardened -> blocker without flag and no hint in reason; locked readOnly no flag; plugin archive check skippable / hardened; archive judged by archive binding even if skippable on transition; each skippable archive check has its own flag; registry-embedded schema check without flag; impl.filesResolved / impl.linksInScope flags; schema-declared skippability; INCOMPLETE_TASKS, deps etc. (pre-existing).

### Missing / Weak Tests

- MISSING: scenario "Archive predicates run without user bypass" (`skipChecks` empty): no test passes a skip set or inspects the execution context; only implied since GetStatus has no skipChecks input. Weak but trivially true by construction (grep: zero `skipChecks` occurrences in get-status.spec.ts).
- WEAK: scenario "Plugin archive check follows its resolved skippability" is covered at the blocker level; verify that the plugin binding path includes registry-resolved `@plugin.check` (embedded test uses registry; label expectations only).
- MISSING: negative test that a blocker's skippability from a transition binding does not leak to archive when the same check id fails on both (reverse of 'judges an archive failure by the archive binding': archive skippable but transition hardened). Minor.
- WEAK: nextAction reason for non-skippable case asserted with `not.toContain('anyway')`, fine.

### Spec Dependency Chain

- core:change, core:kernel, core:transition-change, core:schema-format, core:config, core:lifecycle-engine, core:refresh-implementation-tracking, core:composition-resolver, core:count-tasks, core:transition-checks, core:resolve-change-schema. Delta depends on core:transition-checks for `resolveEffectiveBindings` and bypass semantics (other batch) and on core:schema-format for `archiveChecks` (other batch); consistent with the code. Project-wide: architecture (application use case imports pure domain function `resolveEffectiveBindings`; no infra: complies), error-handling (no new error paths here), testing (spec-first scenarios present).

### Summary counts

Change-relevant requirements 3; implemented 3; discrepancies 0 high, 2 medium (both spec wording, code right), 3 low, 1 info; weak/missing tests 4 (all low).

---

## Overall batch C

- No code-vs-spec failures that require code fixes. The latest changes (neutral SpecOverlapError message + `skippable`, CLI-composed hint, status `bypass:` line, docs example) are consistent with the specs and tested.
- Spec edits recommended: (1) core:get-status "Identifies blockers" OVERLAP paragraph: make the flag in `nextAction.reason` conditional on skippability; and extend the verify scenario for the hardened case; (2) cli:change-status: optionally document the `bypass:` text line shape and clarify that bypass flags also appear on non-archive blockers (flag is accepted by `changes transition` for those); (3) core:get-status: list the check registry in constructor deps / `resolveGetStatusDeps` if it is indeed injected.
- Test follow-ups (low): explicit empty-skipChecks assertion in GetStatus archive evaluation; "ends with" assertion for the overlap hint; hook-progress scenario location check.
