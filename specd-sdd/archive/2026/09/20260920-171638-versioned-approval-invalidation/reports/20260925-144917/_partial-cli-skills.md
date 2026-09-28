# CLI and skills delegated audit — attempt 8

Outer attempt: `verification-attempt-8`. Read-only source review; no attempt, approval, or transition commands executed by this reviewer. Suites are owned by the parent; this report does not independently claim a test run. The resumed assignment narrowed this review to finishing confirmed findings. It is **not an exhaustive pass certificate for all nine assigned specs**.

## Confirmed discrepancies

### CLI-1 — Edit text output drops canonical blockers and next action (medium)

Merged `cli:change-edit`, Approval invalidation, requires all output formats to show canonical blockers and next action. Its scenarios “Ungated preserve reports blocker without invented return” and “Structured output includes recovery guidance” explicitly require these facts, including text output.

`packages/cli/src/commands/change/edit.ts:125` reads `blockers`, and line 126 reads `nextAction`. The text branch at line 170 calls `appendEditConsequences` at line 177 with only effective policy, projection changes, and automatic return. The helper at line 214 never receives or renders blockers or next action. JSON/TOON include both at lines 190–191. Consequently a successful scope edit under preserve can show the retained lifecycle without the reason progress remains blocked or its repair command.

Disposition: the two scenarios fail for text rendering by direct control-flow inspection; structured rendering matches this part of the contract. `packages/cli/test/commands/change-edit.spec.ts:309` covers projection and recovery in JSON but does not exercise the omitted text fields. The test file has no blocker/nextAction fixture or assertion.

Preferred resolution: pass the Core fields into the text presenter and render them without locally choosing recovery. Add a text/JSON/TOON test with a preserved state, a nonempty blocker, and an explicit next action. Alternative: narrow the contract to structured output only, but that would remove diagnostic guidance from the human/agent default and contradict the accepted workflow intent.

### CLI-2 — Invalid verification format is validated after mutation (medium)

`docs/cli/change-verification.md:13` promises that an invalid format fails before mutation. In `packages/cli/src/commands/change/verification.ts`, start, complete and invalidate call their use cases at lines 95, 111 and 129 respectively; only afterward do renderers call `parseFormat` (lines 157, 191 and 228). `packages/cli/src/formatter.ts:23` throws for an unsupported value. A successful use case may therefore persist an attempt, completion, or invalidation before the command fails to format the result.

Disposition: confirmed ordering mismatch by inspection. No mutation probe was run against the active change. `packages/cli/test/commands/change/verification.spec.ts` covers absent/empty reason and other failures, but not invalid-format preflight.

Preferred resolution: validate format before resolving/invoking any mutating use case for all three verbs, then add tests asserting the use case was never called for invalid format. Alternative: document mutation-before-format-failure, but that is surprising and weakens a useful existing promise.

### CLI-3 — Start/complete lack the next action required by the merged scenario (medium contract gap)

Merged `cli:change-verification`, scenario “Structured output distinguishes attempts and evidence”, says text, JSON and TOON identify the relevant attempt/evidence **and canonical next action** when start, completion and repeated invalidation succeed.

`packages/cli/src/commands/change/verification.ts:151` (`renderStart`) and line 187 (`renderComplete`) render identities, fingerprints and reconciliation. `readReconciliation` at line 322 exposes only automatic return, blockers, projection changes and validity; it neither obtains nor emits next action. Invalidation does emit it (lines 249–252 and 271). Core `StartVerificationResult` and `CompleteVerificationResult` return reconciliation rather than a nextAction field, so this is not merely a dropped existing field.

Disposition: start/complete fail that clause of the scenario; identities, safe fingerprint summaries and invalidation guidance pass by source/test inspection. Tests at `packages/cli/test/commands/change/verification.spec.ts:65` and line 91 assert identities and safe summaries, but not next action or three-format parity.

Options: (a) supply canonical guidance through a Core-owned result/projection and render it, without deriving workflow rules in CLI; (b) narrow the scenario to require next action for invalidation only and rely on status for start/complete routing. Option (b) can be reasonable because these commands declare evidence independently of lifecycle, but requires an explicit contract decision rather than counting the current scenario as passing.

### DOC-1 — Verification output documentation promises raw result fields (low)

`docs/cli/change-verification.md:13` says JSON and TOON print use-case fields unchanged. The actual renderers deliberately flatten and whitelist safe public fields: `attemptId`, `verificationId`, summarized `fingerprint`, projected validity and differences. Tests at `packages/cli/test/commands/change/verification.spec.ts:65` and line 91 intentionally assert absence of hashes and source content.

Preferred resolution: update the documentation to describe the public projection and its actual field shapes. Alternative: return raw use-case results, but that conflicts with the merged no-source-content contract and the accepted safe-presentation design. This is a documentation defect, not a request to weaken the presenter.

## Corrected invalidation scenarios and coverage

Merged `cli:change-invalidate` now uses `--artifact-policy` in all three previously obsolete examples. The adapter registers it at `packages/cli/src/commands/change/invalidate.ts:45` and maps parsed targets and structured overrides into Core. The three corrected scenarios are supported as follows:

| Scenario                                               | Disposition                                                   | Evidence                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope-incompatible artifact-at-spec target is rejected | Supported by source and targeted Core test; no live CLI probe | `invalidate-change.spec.ts:232` asserts `INVALID_INVALIDATE_TARGET` plus `is scope:change` message |
| Downstream requires at least one target                | Supported by source and targeted Core test                    | `invalidate-change.spec.ts:203` asserts code and target-required message                           |
| Global rejects explicit targets                        | Supported by source and targeted Core test                    | `invalidate-change.spec.ts:174` asserts code and forbidden-target message                          |

Those test paths are under `packages/core/test/application/use-cases/`. They do not rely only on exit code 1, so they do not pass merely because Commander rejected an obsolete flag. The adapter mapping test in `packages/cli/test/commands/change/change-invalidate.spec.ts:115` uses the current flag and asserts the exact structured input. Core `packages/core/src/application/use-cases/invalidate-change.ts:101` validates command shape and resolves targets before actor lookup/reconciliation at line 137. Thus the inspected invalid-target paths cannot reach the mutation call. However the three targeted tests do not independently assert an unchanged manifest or a never-called persistence/reconciliation spy; that is a coverage improvement for the new no-mutation clause, not evidence of an observed mutation bug.

Other reviewed invalidate scenarios: independent policy override mapping, none informational output, affected target ordering, exact force recovery targets, named JSON/TOON reason and Core delegation have implementation/test evidence in the same CLI file. CLI target semantic normalization and force decisions remain delegated to Core. No obsolete `--policy` remains in the merged invalidate verification artifact read for this audit.

## Skills observations and limits

Merged `skills:workflow-automation` was read in full, as was the requirements artifact for `skills:skill-templates-source`. The installed compliance instructions were read and specify explicit delegated ownership and complete change-scoped discovery/reporting. `packages/skills/test/template-workflow.spec.ts:257` covers independent/delegated ownership phrases; line 283 parses the downstream decision table and compares all seven change-scoped decisions plus start/complete ownership. `packages/skills/test/generated-skill-protocol.spec.ts` checks generated-copy phrases and decision-table parity for five installed runtimes. These support the reviewed ownership scenarios; they are text-contract tests, not execution of an autonomous skill.

No additional confirmed skill defect is asserted in this resumed narrow review. Some large combined preview outputs were truncated: the full transition verification artifact and full templates verification artifact were not completely inspected here. Do not classify all their scenarios as passed on the basis of this partial report.

## Scope and aggregate disposition

Assigned: seven CLI specs plus two skills specs. Fully read merged artifacts in this reviewer: `cli:change-invalidate`, `cli:change-verification`, `cli:change-edit`, `cli:change-create`, `cli:change-status`, `cli:change-approve`, `skills:workflow-automation`. Read merged requirements for `skills:skill-templates-source`; transition output was partly truncated. These reads alone are not implementation verification.

Confirmed findings: **4** (3 behavior/contract discrepancies, 1 documentation discrepancy). Explicit corrected invalidation scenarios examined: **3 supported** by source and targeted tests, with the no-mutation test-strength limitation above. Explicit failing presentation scenarios: edit text recovery guidance and verification start/complete next action. No full scenario pass count is claimed. Global specs were loaded by the parent; this partial does not claim independent exhaustive dependency expansion or global conformance.

One artifact follow-up remains unclassified: merged `cli:change-edit` retains “JSON output with invalidation”, whose only stated precondition is `spec-approved` and whose expected result is unconditionally `invalidated: true` / `designing`. That expectation appears under-specified relative to gate/policy-aware recovery, but requires checking the intended legacy drain fixture before labeling it a separate defect. Do not count it as a confirmed failure in the aggregate.
