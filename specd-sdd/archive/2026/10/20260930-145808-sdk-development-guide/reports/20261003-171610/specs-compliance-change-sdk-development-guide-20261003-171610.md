# Spec compliance audit — `sdk-development-guide`

**Mode:** full verification compliance audit  
**Date:** 2026-10-03  
**Scope:** the 14 change specs, their direct dependencies, and applicable global specifications.

## Executive summary

The JSON-catalog direction is correct: the package declares and publishes both JSON catalog assets, and a packed/extracted artifact initialized the user and SDK engines with 22 and 1319 topics respectively. Focused tests also passed: `@specd/guide` 125/125 and focused CLI guide suites 104/104.

The audit is **not clean**. It found four implementation discrepancies (published JSON synchronization, section-bounded search snippets, `GetGuideQuery` port delegation/blank-input ordering, and a stale CLI help example), two artifact/spec contradictions (generated source-path exposure and unknown-topic candidate enumeration), and two quality gaps (missing JSDoc and no automated packed-artifact regression test).

## Aggregate counts

| Category                               |                              Count |
| -------------------------------------- | ---------------------------------: |
| Change specs audited                   |                                 14 |
| Confirmed implementation discrepancies |                                  4 |
| Artifact/spec-policy conflicts         |                                  2 |
| Quality/test coverage discrepancies    |                                  2 |
| Focused guide tests                    |               125 passed / 125 run |
| Focused CLI guide tests                |               104 passed / 104 run |
| Packed-artifact manual check           | passed (22 user / 1319 SDK topics) |

## Recommended routing

Run `/specd-design sdk-development-guide` first to reconcile the two contradictory verification/error contracts. Then run `/specd-implement sdk-development-guide` to repair the confirmed code and test gaps. The JSON-based catalog design should be retained.

## Detailed findings

### CLI audit

The partial audit is retained at `_partial-cli.md`; its complete findings follow.

#### Requirements Summary

This read-only audit reviewed the merged verification artifacts for `cli:guide-sdk`, `cli:entrypoint`, and `cli:guide`, and the direct runtime dependencies that deliver their behavior. The merged verify artifacts contain 22 requirements / 101 scenarios for `cli:guide-sdk`, 18 / 63 for `cli:guide`, and 33 / 95 for `cli:entrypoint`. The latter two contain broader pre-existing coverage; this audit is limited to the requirements reached by the SDK-guide change.

- `cli:guide-sdk`: bounded SDK catalog listing; independent `--scope` and `--collection`; structured text/JSON/TOON envelopes; topic metadata, section and line-window reads; short unknown-topic errors; title suggestions; and SDK search.
- `cli:guide`: preserves the existing user-guide behavior while adding a structured discovery pointer to the sibling `specd guide-sdk` command and a matching listing envelope.
- `cli:entrypoint`: exposes the command through the root Commander program without eagerly loading the generated SDK catalog.

#### Implementation Status

Implemented and exercised:

- `packages/cli/src/program.ts` registers `guide` and `guide-sdk`. The latter receives a memoized lazy dynamic import of `@specd/guide/sdk`, so non-SDK commands do not load the generated catalog.
- `packages/cli/src/commands/guide-sdk/index.ts` registers `guide-sdk [topic]` and `guide-sdk search [query]`; validates scope/collection; uses the shared pagination, formatter, and error routes; and delegates topic retrieval, sections, metadata, and search to `GuideEngine`.
- `packages/cli/src/commands/guide/index.ts` retains the user guide and emits the `sdkGuide` discovery data for listings. `packages/cli/src/commands/guide/formatters.ts` serializes the shared structured envelopes and deliberately suppresses generated declaration paths from public topic metadata and search hits.
- The direct implementation chain is present in the graph and has high blast-radius visibility: `guide-sdk/index.ts` -> guide formatters/listing options/error mapping -> `@specd/guide/sdk` engine; `program.ts` -> both guide command registrations.

#### Discrepancies

**Verification artifact contradicts the shipped public-output policy (blocking spec/verify drift).** The merged `cli:guide-sdk` verification scenarios still require the generated-topic metadata and body to report the declaration source path. The actual implementation omits `file` for generated topics and search hits. That matches the active decision that generated source paths are repository-internal. This is an artifact-level inconsistency: revise the scenario to require omission.

**Stale CLI help example.** `packages/cli/src/commands/guide-sdk/index.ts` still shows `sdk:interfaces/ArtifactDag --meta`, while the catalog and merged requirement use `sdk:classes/ArtifactDag`.

#### Test Coverage and missing tests

The CLI audit executed focused guide-related suites and reports 87 test files / 1,097 tests passed. Add coverage for the canonical `ArtifactDag` help example, real root-program registration/lazy factory behavior, and generated-topic path suppression after reconciling the artifact.

#### Summary counts

| Item                                |      Count |
| ----------------------------------- | ---------: |
| Audited spec IDs                    |          3 |
| Merged requirements inspected       |         73 |
| Merged scenarios inspected          |        259 |
| Implementation discrepancies        |          0 |
| Artifact/verification discrepancies | 1 blocking |
| Stale help examples                 |          1 |
| Missing-test areas                  |          3 |

### Guide-domain audit

The partial audit is retained at `_partial-guide.md`; its complete findings follow.

#### Requirements Summary

The merged guide specs require separately publishable JSON user and SDK catalogs. Runtime may read packaged JSON but must not parse documentation roots, Markdown, or TypeDoc. The domain contract includes qualified `collection:topic` identity, normalized lookup, scoped pagination, offsets, and collection-aware search.

#### Implementation Status

`guide:guide-model`, `guide:composition`, `guide:get-guide-outline`, and `guide:slice-guide-content` are implemented. `guide:list-guides` is mostly implemented. `guide:bundle-guides`, `guide:conventions`, `guide:get-guide`, and `guide:search-guides` have failed requirements described below. `guide:errors` has an artifact conflict.

#### Discrepancies

1. **Published JSON can become stale after a normal build.** `scripts/bundle-guides.ts` writes `src/infrastructure/generated/*.json`, while runtime and the npm package use package-root `generated/*.json`. No synchronization step connects them. The current files happen to agree, but a future build can package stale assets.
2. **Search snippets can bleed into neighbouring sections.** `MiniSearchGuideEngineAdapter.generateSnippet()` uses document-wide display bounds rather than `sectionStartLine`/`sectionEndLine`.
3. **`GetGuideQuery` bypasses the catalog lookup contract and late-validates blank input.** It scans `getAllTopics()` rather than using `GuideCatalogPort.getGuide(...)`; whitespace reaches the catalog instead of being rejected first.
4. **`guide:errors` conflicts with the bounded SDK error contract.** The merged error requirement demands available topics in the message, but the SDK requirement forbids enumerating the thousand-plus catalog. Implementation correctly keeps candidates structured-only; artifacts must decide and reconcile the policy.

#### Test Coverage and missing tests

`pnpm --filter @specd/guide test` passed 125/125. Missing regressions: fresh build → packed artifact propagation, snippet section-boundary windows, `GetGuideQuery` port delegation, blank-topic early rejection, and a settled structured-only candidate policy.

#### Summary counts

| Item                                   |                Count |
| -------------------------------------- | -------------------: |
| Specs audited                          |                   10 |
| Implemented/mostly implemented         |                    6 |
| Confirmed implementation discrepancies |                    3 |
| Artifact/spec-policy conflicts         |                    1 |
| Focused tests                          | 125 passed / 125 run |
| Critical missing regression areas      |                    5 |

### Global/dependency audit

The partial audit is retained at `_partial-globals.md`; its complete findings follow.

#### Requirements Summary and status

The change conforms to applicable documentation location, ESM/package-boundary, and architecture constraints. `core:config` is not applicable. Package JSON correctly includes `dist/` and `generated/`, and the packed artifact loaded both engines without documentation source roots.

#### Discrepancies

1. **Missing JSDoc on `loadCatalog` (low).** `packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts` has an undocumented function, contrary to the global docs convention.
2. **No automated packed-artifact regression test (medium).** The required pack/extract/import behavior was manually verified but has no portable automated test.

#### Additional observations

Corrupt generated assets currently throw native errors; that is acceptable if treated as unexpected integrity failure, but should be classified if product behavior regards it as a consumer-facing expected error. The isolation unit test checks module rendering rather than byte-for-byte emitted JSON stability.

#### Summary counts

| Category                                           | Count |
| -------------------------------------------------- | ----: |
| Applicable global/direct dependency specs reviewed |     3 |
| Non-applicable direct dependency specs reviewed    |     1 |
| Confirmed discrepancies                            |     2 |
| Medium-severity discrepancies                      |     1 |
| Low-severity discrepancies                         |     1 |
| Missing regression tests                           |     3 |
