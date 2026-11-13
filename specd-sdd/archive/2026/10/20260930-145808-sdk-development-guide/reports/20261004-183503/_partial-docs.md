# Documentation compliance audit

## Requirements Summary

Audited the merged `default:_global/docs` delta relevant to the SDK guide collection and the `guide-sdk` CLI documentation surface.

## Implementation Status

- `docs/cli/guide-sdk.md` exists and describes listing, topic inspection, metadata, scope, pagination, sections, and search.
- `docs/cli/index.md` indexes `guide-sdk`.
- `docs/guide/cli.md` contains scenario-oriented `guide-sdk` examples.
- `apps/public-web/sidebars.ts` exposes `cli/guide-sdk`.

## Discrepancies

### DOC-1 — Generated topic metadata description implies a source path is exposed (medium)

`docs/guide/cli.md` states that generated-topic metadata reports `packageName` and `importStatement` "because the `file` path points inside the specd repository". The merged `cli:guide-sdk` requirement explicitly prohibits a generated API topic from exposing its declaration source path in body or metadata; generated search hits likewise omit `file` entirely. The implementation/test suite appears to follow the spec, so this is documentation drift rather than an implementation defect.

## Test Coverage

The full repository test hook passed. CLI SDK tests exercise documentation-facing command behaviour; sidebar and public-docs tests cover the site routing surface.

## Missing Tests

No missing automated test was identified for the document presence/index/sidebar requirements. Add a documentation-content regression test if maintaining the exact generated-topic metadata wording is important.

## Dependency Chain

`default:_global/docs` → `default:_global/conventions`; this change additionally depends on the public CLI and guide package contracts.

## Summary

- Requirements reviewed: 1 change-specific documentation surface
- Implementation/code findings: 0
- Documentation-drift findings: 1
- Missing-test findings: 0
