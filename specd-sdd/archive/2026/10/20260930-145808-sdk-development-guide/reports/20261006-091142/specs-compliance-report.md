# Specs-compliance report — `sdk-development-guide`

**Mode:** change  
**Generated:** 2026-10-06  
**Change:** `20260930-145808-sdk-development-guide`

## Summary

| Severity    | Count |
| ----------- | ----: |
| Critical    |     0 |
| High        |     0 |
| Medium (P2) |     1 |
| Low         |     0 |

The CLI and Guide-core implementations comply with the merged requirements. One P2 specification/verification inconsistency remains in `guide:get-guide`: its requirement unconditionally requires `collection:topic`, while implementation and verification scenarios deliberately accept an unqualified topic when a catalog exposes exactly one collection.

## Verification gates

- `changes validate sdk-development-guide --all` passed: 33/33 artifacts.
- The post-implementation `pnpm test` gate passed, including Guide (135) and CLI (1099) tests.
- Compiled CLI smoke checks passed for `guide` and `guide-sdk`; the unsupported Markdown output format was rejected.
- The project graph was current and used for impact/dependency checks.

## Evidence reports

The complete specialist evidence is retained verbatim in the following partial reports:

- [\_partial-cli.md](_partial-cli.md)
- [\_partial-guide-core.md](_partial-guide-core.md)
- [\_partial-guide-queries.md](_partial-guide-queries.md)

## Finding GQ-001 — P2

**Requirement:** the merged `guide:get-guide` specification says topics **MUST** be addressed as `collection:topic`.

**Evidence:** `GetGuideQuery.execute` accepts an unqualified reference whenever `getCollections()` returns exactly one collection (`packages/guide/src/application/queries/get-guide-query.ts:54-61`). The merged verification artifact and unit tests intentionally require success for `workflow`, `GETTING-STARTED`, and `configuration.md` in that single-collection case (`packages/guide/test/unit/application/queries.spec.ts:286-296`).

**Assessment:** this is a specification/internal-verification inconsistency, not a runtime defect. The shorthand is a reasonable backwards-compatible API, but conflicts with the unconditional MUST statement.

**Resolution choices:**

1. Update the specification to allow an unqualified topic only when exactly one collection is available. This matches the implementation and existing tests.
2. Remove shorthand support from the implementation and update verification scenarios/tests to require qualified identities everywhere.
3. Proceed while recording GQ-001 as accepted specification debt.

## Non-blocking hardening opportunities

- Add a direct contract test explicitly naming the intended single-collection shorthand exception (or universal rejection, if option 2 is chosen).
- Add README-to-catalog parity, immutable error-code, fenced-heading, and level-6 heading regression assertions.
- Add a process-level CLI config-position integration assertion.
