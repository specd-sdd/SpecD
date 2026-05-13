# Tasks: cross-artifact-ready-participants

## 1. Participant rehydration

- [x] 1.1 Add complete-state participant rehydration helper
      `packages/core/src/application/use-cases/_shared/cross-artifact-participant-state.ts`: `rehydrateReadyArtifactParticipant` and `RehydrateReadyArtifactParticipantInput` — introduce the shared helper that reloads and parses an already-`complete` participant so cross-artifact validation can reuse it.
      Approach: expand the current shared module from interface-only to helper-owned logic; accept change/spec repositories, parser registry, expected filename inputs, and return `ReadyArtifactParticipant | null` rather than throwing for ordinary “not rehydratable” cases.
      (Req: Cross-artifact structural validation)

- [x] 1.2 Support both direct-file and delta-backed participant reconstruction
      `packages/core/src/application/use-cases/_shared/cross-artifact-participant-state.ts`: `rehydrateReadyArtifactParticipant` — reconstruct the same parsed/materialized output shape used by in-invocation validation, including merged preview for delta-backed `scope: spec` artifacts.
      Approach: reuse the same expected-filename, parser selection, base-artifact loading, and delta-application rules already used in `ValidateArtifacts`, so rehydrated participants are structurally equivalent to locally prepared ones.
      (Req: Cross-artifact structural validation)

## 2. Cross-rule evaluation flow

- [x] 2.1 Add a rule-aware participant collection step
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidateArtifacts.execute()` and private `_collectCrossRuleParticipants(...)` — build the participant map per cross-rule by preferring participants prepared in the current invocation and filling gaps via rehydration from `complete` state.
      Approach: keep the existing per-artifact validation loop intact, but move the “should this rule defer?” decision into a private helper that can inspect tracked artifact state and rehydrate before returning `deferred: true`.
      (Req: Cross-artifact structural validation)

- [x] 2.2 Preserve ready-participant caching within one invocation
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `readyParticipants` management inside `execute()` — cache rehydrated participants so multiple rules in the same invocation do not reload the same artifact repeatedly.
      Approach: insert successfully rehydrated participants into the same `Map<string, ReadyArtifactParticipant>` used by locally validated artifacts, so later rule evaluations share the prepared output without new branches.
      (Req: Cross-artifact structural validation)

- [x] 2.3 Keep defer semantics only for genuinely unavailable participants
      `packages/core/src/application/use-cases/validate-artifacts.ts`: cross-rule warning path — continue emitting the existing non-failing deferred warning only when the participant is missing, still invalid, or cannot be rehydrated from `complete` state.
      Approach: preserve the current warning text and failure-free behavior, but move the defer decision after the rehydration attempt so “validated in an earlier invocation” no longer counts as unavailable.
      (Req: Cross-artifact structural validation)

## 3. Regression tests

- [x] 3.1 Add later-pass rehydration regression coverage
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: new describe block around cross-artifact participant rehydration — prove that validating `specs` first and `verify` later causes the second pass to rehydrate `specs` and evaluate the rule instead of deferring again.
      Approach: model the change state so `specs` is already `complete`, then validate `verify` in a separate invocation and assert rule evaluation happens with no false deferral warning.
      (Req: Cross-artifact structural validation; scenario: Completed counterpart is rehydrated for a later validation pass)

- [x] 3.2 Preserve same-invocation behavior and genuine deferral
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: existing cross-artifact scenarios — keep passing coverage for same-invocation participants and for deferral when the counterpart is truly missing or locally invalid.
      Approach: retain the current tests as controls, then add explicit assertions that missing or invalid counterparts still produce the non-failing deferred warning.
      (Req: Cross-artifact structural validation; scenario: Missing ready participant defers cross-artifact validation)

- [x] 3.3 Cover unreadable or non-rehydratable complete counterparts
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: rehydration failure scenarios — ensure a participant marked `complete` but missing expected content, parser support, or materializable output causes deferral rather than crash or false success.
      Approach: stub repository reads and parser lookup so rehydration returns `null`, then assert the warning path is used and rule evaluation is skipped.
      (Req: Cross-artifact structural validation)

- [x] 3.4 Cover delta-backed and direct-file rehydration paths
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: artifact-shape coverage — verify rehydrated participants are built from merged delta output for delta-backed artifacts and from direct content for non-delta artifacts.
      Approach: create one test with base artifact + delta file and another with direct tracked content; in both, assert the evaluator sees the expected keys from the materialized artifact, not raw delta YAML.
      (Req: Cross-artifact structural validation; scenario: Spec-scoped relation compares merged outputs)

- [x] 3.5 Add helper-level tests if the rehydration logic is split out
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts` or a new shared-helper test file — exercise the helper directly for direct parse, delta merge, and null-return cases.
      Approach: test `rehydrateReadyArtifactParticipant(...)` in isolation where practical so repository/parsing edge cases do not have to be asserted only through `execute()`.
      (Req: Cross-artifact structural validation)

## 4. Verification and workflow checks

- [x] 4.1 Run targeted automated validation for the touched area
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: test execution — run the focused `ValidateArtifacts` suite first to verify the new participant rehydration behavior and all preserved deferral paths.
      Approach: start with the targeted spec file, then widen to broader core tests only if the helper extraction changes shared participant-preparation behavior.
      (Req: Cross-artifact structural validation)

- [x] 4.2 Perform manual two-pass validation checks
      `node packages/cli/dist/index.js changes validate ...`: manual workflow verification — validate `specs` first, then `verify`, and confirm the second pass evaluates the cross-rule when the first participant is already `complete` and rehydratable.
      Approach: reproduce the bug with a real change fixture, then repeat with the counterpart missing or invalid to confirm genuine deferral still surfaces the warning.
      (Req: Cross-artifact structural validation; scenario: Completed counterpart is rehydrated for a later validation pass; scenario: Missing ready participant defers cross-artifact validation)
