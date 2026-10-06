# CLI compliance audit — `sdk-development-guide`

## Scope and evidence

Audited merged change previews for `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture`; the CLI implementation, documentation, and focused test suite; and direct `@specd/guide` integration. Graph stats were current (`stale: false`, `fingerprintMismatch: false`) at audit time.

## Requirements summary

The change requires a lazily loaded top-level `guide-sdk` delivery adapter over `@specd/guide/sdk`; paginated, scoped, collection-aware catalog/list/index/topic/search behavior; standard CLI config/output/exit behavior; structured discovery from `specd guide`; documentation/site navigation; and no CLI business logic or forbidden direct core/code-graph dependency.

## Implementation status

- `registerGuideSdkCommand` is registered by `createProgram`; `program.ts` caches a dynamic `import('@specd/guide/sdk')`, so normal commands do not load the SDK catalog.
- The command delegates listing, lookup, slicing, and search through `GuideEngine`; `packages/cli/package.json` declares `@specd/guide` and does not declare direct runtime dependencies on `@specd/core` or `@specd/code-graph`.
- Scope and collection validation, pagination, generated-topic withholding, structured listing/index envelopes, topic metadata/slicing, error output, and search formatting are implemented in the CLI adapter.
- `specd guide` exposes `sdkGuide` in its structured listing envelope and in text/help output.
- Required docs and navigation are present: `docs/guide/index.md`, `docs/guide/cli.md`, `docs/cli/index.md`, `docs/cli/guide-sdk.md`, and `apps/public-web/sidebars.ts`.

## Discrepancies

### F-CLI-001 — Markdown output required by merged guide contracts is not supported (medium)

Both merged `cli:guide` and `cli:guide-sdk` requirements require discovery/listing and pagination behavior under `text`, `markdown`, `json`, and `toon`. `parseGuideFormat` accepts only `text`, `json`, and `toon`; invoking `node packages/cli/dist/index.js guide-sdk --format markdown` exits with `INVALID_FORMAT`. No CLI test covers Markdown output. Consequently, Markdown-specific obligations (including the `sdkGuide` discovery field and collection/page rendering) cannot be satisfied.

Recommended resolution: either implement `markdown` as a supported `GuideOutputFormat` with coverage in both guide command suites, or revise the merged requirements to remove Markdown as a supported CLI format if that is the intended contract.

## Test coverage

- `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts` covers registration/lazy resolution, catalog scopes and collection composition, validation errors, pagination/indexing, unknown-topic diagnostics, metadata, slicing, search, and help.
- `packages/cli/test/commands/guide/guide.test.ts` covers SDK discovery in text/JSON/TOON and help.
- `packages/cli/test/documentation-coverage.spec.ts` asserts the guide overview discovery link.
- The implementation-level gates reported for this change (`pnpm test`, lint, and typecheck) were successful before this verification audit.

## Missing tests

- Add success-path tests for `--format markdown` on both `guide` and `guide-sdk`, specifically asserting the structured discovery semantics and page/collection rendering required by the specs.

## Spec dependency chain

`default:_global/architecture` permits the CLI delivery dependency on `@specd/guide` and lazy SDK subpath loading. `cli:entrypoint` requires top-level registration and standard command behavior. `cli:guide-sdk` defines the SDK adapter contract. `cli:guide` and `default:_global/docs` require discovery and published documentation. The CLI delegates its catalog semantics to the guide package contracts rather than duplicating them.

## Counts

- Requirements reviewed: 5 spec scopes
- Implemented/covered areas: 4 scopes substantially conformant
- Findings: 1 (`medium`)
- Missing-test categories: 1
