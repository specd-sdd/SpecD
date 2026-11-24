# Batch E - round 14 audit of get-status.ts `_mergeBlockers`

Scope: packages/core/src/application/use-cases/get-status.ts `_mergeBlockers` (1018-1220). Read-only; scratch copy at
/private/tmp/claude-501/-Users-monki-Documents-Proyectos-specd-worktrees-feat-lifecycle-transitions-ux/d6514280-9950-4b20-a585-df403cd3147e/scratchpad/cc
(matrix.spec.ts, probe.spec.ts, mut.py).

## Verdict

No HIGH defect and no deviation from the spec rule found in the new skippability logic. 2 LOW/MEDIUM suspected points, plus test-gap survivors.

## Test counts

get-status suites (6 files): 110/110 pass. audit-2: 6, audit: 12, families: 9, merge-audit: 16, spec-consent-audit: 1, get-status.spec: 66.

## (1) Path re-derivation (checked, OK)

- Pass 1: per failing candidate, per (id,message) key, map = transition|archive; seed = true (transition) or AND over ALL archive bindings of that id (only when archiveChecks non-empty); value = (prev ?? seed) && own binding skippable (applicable binding via bindingMatches, else sameCheck[0]). Order independent (AND).
- Verdict blockers with checkId: resolved only from transitionSkippable (same id+message); otherwise own isSkippable ?? false. No archive fallback remains.
- Candidate loop: ownKey merge ANDs existing.isSkippable with the check's own-context map value (archive context -> archive map; transition -> already ANDed). Verdict+archive same message with no transition predicate: own && archive (own false/absent => false; own true and archive skippable => true). Consistent with "keeps its own isSkippable"; AND across contexts.
- Families: dropped validity blockers, droppedActions adoption, yieldsToVerification all intact (probe: verification.current on 2 targets skippable/locked + VERIFICATION_STALE validity w/ action => ONE blocker, isSkippable false, checkId verification.current, action start-verification adopted).
- Different messages stay separate blockers with own skippability; archive failure with no archive binding => false.

## (2) Matrix (scratch, direct call of private method with an oracle derived from the spec)

5 (target1: none | m1/m2 x skip/lock) x 5 (target2) x 9 (archive: none | m1/m2 x pattern [T],[F],[T,F],[F,T,T]) x 7 (verdict blocker: none | m1/m2 x isSkippable undefined/true/false) = 1575 cases of {transition only/archive only/both} x {skippable/locked} x {same/diff message} x {single/multi target} x {verdict w/ or w/o predicate}. 0 lost, 0 duplicated, 0 wrongly flagged, checkId always preserved. The matrix is sensitive: it fails under mutations M1,M2,M3,M3b,M4,M5,M6,M10,M11,M14,M15,M16.
Probes (family merge, attemptFor binding selection) match expectations.

## (3) Mutation review (scratch copy of src+tests; "caught by" = existing 3 audit suites + get-status.spec)

| #       | Mutation                                                 | Existing tests                                                                |
| ------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | --- | --------------------------------------- |
| M1      | `(map.get ?? seed) && skippable` -> `                    |                                                                               | `   | CAUGHT (11 fail: merge-audit, families) |
| M2      | skipKey without message                                  | CAUGHT (2: "own binding when messages differ", "different messages keep own") |
| M3      | drop archiveIdSkippable pre-seed (seed=true)             | CAUGHT (merge-audit "ANDs over every archive binding")                        |
| M3b     | pre-seed AND -> OR                                       | CAUGHT (same test)                                                            |
| M4      | archive fallback for verdict blocker restored            | SURVIVES (see gap G1)                                                         |
| M5      | nextSkippable AND -> OR                                  | CAUGHT (3)                                                                    |
| M6      | nextSkippable ignores existing                           | CAUGHT (2)                                                                    |
| M7      | family drop disabled                                     | CAUGHT (12)                                                                   |
| M8      | adopted action disabled                                  | CAUGHT (1, merge-audit "adopted action")                                      |
| M9      | applicable binding ignored (always sameCheck[0])         | CAUGHT (3)                                                                    |
| M10     | archive uses transition map                              | CAUGHT (8)                                                                    |
| M11/M15 | verdict blocker ignores resolved transition skippability | SURVIVES (G2)                                                                 |
| M12     | archive candidates before transition (ordering)          | SURVIVES (G3)                                                                 |
| M13     | yieldsToVerification off                                 | CAUGHT (3)                                                                    |
| M14     | no AND on ownKey merge                                   | CAUGHT (1)                                                                    |
| M16     | unmatched applicable -> false                            | CAUGHT (8)                                                                    |
| M17     | `absorbed.set` removed                                   | SURVIVES (G4)                                                                 |

Test gaps (all LOW, behaviour currently correct):

- G1 get-status-merge-audit "verdict blocker without a failing predicate takes nothing from archive bindings" (spec scenario) uses DIFFERENT messages ('verdict says no' vs 'archive failure'), so with the message-keyed map the restored fallback (M4) can never fire in that test and it passes vacuously. Needs same check id AND same message for verdict blocker + archive failure (expect isSkippable false with own absent). Matrix catches M4.
- G2 No test with a verdict blocker carrying a checkId and isSkippable undefined/true plus a transition predicate with a different resolved skippability (resolved ?? own line). Matrix catches it.
- G3 No test pins output order of transition vs archive blockers.
- G4 `absorbed` bookkeeping (two distinct checks sharing code:message with one checkId-less blocker, when the verdict has NO check-derived blockers) is untested because via the real engine the check-derived blockers already exist; only the direct-call path exercises it.

## Suspected defects

1. MEDIUM-LOW (suspected, synthetic-input only), get-status.ts ~1175-1193 (anonymousKey path): a failing predicate with a non-family code (e.g. ARTIFACT_REVIEW_REQUIRED) whose code:message equals a checkId-less verdict blocker is ABSORBED into that blocker and no checkId/label/isSkippable of the check is emitted (probe: result `{code:ARTIFACT_REVIEW_REQUIRED,message:same,isSkippable:false}` with no checkId). Spec says per-artifact codes are never merged and a predicate blocker always carries checkId. Not reachable through the real evaluateLifecycle (it already emits check-derived blockers with checkId, as the existing test shows), and it is not part of round-14 skippability. Consider dropping the anonymousKey branch for codes with no family.
2. LOW (suspected), get-status.ts ~1075-1077: when attemptFor is given but no binding of the target matches the attempt, skippability falls back to `sameCheck[0]` (probe 'nomatch': skippable binding scoped to another `to` yields isSkippable true). Spec: "resolved binding for the evaluated candidate". Fail-open rather than fail-closed; bindingsByTarget are already resolved per target so practically unreachable. Mutation M16 (fallback -> false) breaks 8 existing tests, so the fallback is relied on by tests using direct/legacy bindings.

Nothing found: AND semantics, pre-seed, message keying, no archive fallback, archive-only/transition-only/both, multi-target and multi-binding archive, family merge/drop/adoption, no lost or duplicated blockers.

## (4) Real CLI

`node packages/cli/dist/index.js changes status decouple-core-cli-workflow-guidance --format toon`: state verifying, validity.blockers[0], blockers[0], lifecycle.blockers[0], nextAction done/mechanical/verify, verification-16 valid. packages/core/dist/chunk-6BCPVDX5.js contains `archiveIdSkippable` (dist is current). Common-case blockers output unchanged (empty, as expected for a verified change).
