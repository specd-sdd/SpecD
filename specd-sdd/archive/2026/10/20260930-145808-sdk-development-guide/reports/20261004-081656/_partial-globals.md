# Full Global and Direct-Dependency Compliance Review — SDK Development Guide

**Change:** `sdk-development-guide` (state: `verifying`, 89/89 tasks complete)

**Scope:** `default:_global/docs`, `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/continuous-integration`, `default:_global/error-handling-conventions`, and direct dependency `core:config`.

**Method:** Reviewed merged change artifacts (`cli:guide-sdk`, `guide:bundle-guides`, `guide:conventions`, `default:_global/docs`); inspected code, tests, package manifests, CI, and documentation; used current graph symbol and impact data. The graph is current (`1,207` indexed files, `42,470` symbols, no stale/mismatch indicators).

## Requirements Summary

| Requirement source                                       | Applicable expectation                                                                                           | Status                                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/docs`                                   | CLI contract changes update `docs/cli` and `docs/guide`; docs use approved roots; all symbols have JSDoc.        | Partially met: new docs exist in approved locations and newly inspected adapter symbols are documented; invalid generated-topic examples remain.               |
| `default:_global/architecture`                           | Layered package structure; CLI hosts use public facades, no concrete adapters; no circular workspace dependency. | Met for this change: guide composition owns adapters; CLI obtains the SDK engine through the public `@specd/guide/sdk` subpath and lazy dynamic import.        |
| `default:_global/conventions` / `default:_global/eslint` | Strict ESM TypeScript, named exports, no `any`, kebab-case production files, explicit public types and JSDoc.    | Met by inspected changed production surfaces.                                                                                                                  |
| `default:_global/testing`                                | Vitest tests under `test/`, portable paths/fixtures, test naming convention `.spec.ts`.                          | Partially met: Vitest coverage is substantial and paths use `node:path`; newly added test filenames use `.test.ts`, contrary to the global naming requirement. |
| `default:_global/continuous-integration`                 | macOS/Ubuntu/Windows, frozen pnpm install, build → typecheck → test.                                             | Met: existing CI workflow supplies the required matrix and order; no workflow change was required.                                                             |
| `default:_global/error-handling-conventions`             | Expected failures have stable SpecD-style code and actionable messaging.                                         | Met for CLI-facing topic/scope/collection failures; native errors remain limited to package/build asset-integrity failures.                                    |
| `core:config`                                            | Configuration changes preserve validated, meaningful configuration behavior.                                     | No behavioral configuration feature is introduced. One stale graph-exclusion configuration entry is recorded as an observation.                                |

## Implementation Status

- `@specd/guide` builds independently loadable JSON assets at `packages/guide/generated/guides.json` and `packages/guide/generated/guides-sdk.json`; its manifest publishes `generated/` together with `dist/`.
- `PrebundledGuideCatalogAdapter` uses only its selected packaged JSON asset. `createGuideEngine()` targets the user catalog and `createGuideSdkEngine()` targets the SDK catalog, preserving composition/application/infrastructure separation.
- The CLI registers `guide-sdk` through the public facade. The graph locates `registerGuideSdkCommand` in `packages/cli/src/commands/guide-sdk/index.ts` and traces its consumers to `createProgram`, `cli` entrypoint, command tests, and documentation-coverage test.
- Build-time collection compilation reads only approved `docs/{guide,sdk,core,code-graph,skills,schemas}` roots and generates TypeDoc-based symbol topics.
- The live CLI confirms the canonical class route works: `guide-sdk sdk:classes/ArtifactDag --format json` exits 0. The old interface route exits 1 and suggests the canonical class route.
- JSDoc gap identified in the preceding global review has been remedied: `loadCatalog` now documents parameters, return value, and failure condition.

## Discrepancies

### D1 — Published documentation contains an invalid generated-topic route (medium)

The merged contract declares `ArtifactDag` at `sdk:classes/ArtifactDag`. However, the following user-facing references instruct users to use `sdk:interfaces/ArtifactDag`:

- `docs/cli/guide-sdk.md` (argument example and retrieval example)
- `docs/guide/cli.md` (SDK guide overview example)
- `packages/guide/README.md` (generated-topic description and SDK collection table)

The actual command verifies the defect: `sdk:interfaces/ArtifactDag` exits 1 with `UNKNOWN_GUIDE_TOPIC`, while `sdk:classes/ArtifactDag` exits 0. This violates `default:_global/docs` requirement that CLI documentation tracks the changed command contract and makes the shipped examples non-copy-pasteable.

**Resolution:** replace every `sdk:interfaces/ArtifactDag` occurrence with `sdk:classes/ArtifactDag`, then add a documentation/example assertion or a link check that catches generated-topic kind drift.

### D2 — Required packed-artifact behavior is not covered by an automated tarball test (medium)

The merged `guide:bundle-guides` scenario requires a packed `@specd/guide` artifact with no documentation source directories to import both engines successfully. The current integration test verifies `package.json#files` contains `generated/` and loads engines from the checkout, but no test packs/extracts the package (`npm pack` or equivalent) and imports it from that isolated artifact.

Manual pack/extract evidence passed earlier in this change, but it is not a regression test. A future relative-path, `files`, or build-output change could regress publication while the existing suite stays green.

**Resolution:** create a cross-platform temporary tarball/extract integration test that imports `dist/public.js` and `dist/sdk.js` from the extracted package and asserts both catalogs load without any `docs/` source tree.

### D3 — New test filenames do not comply with the global `.spec.ts` convention (low)

The change adds `packages/guide/test/integration/sdk-catalog.test.ts` and `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts`. `default:_global/testing` requires `.spec.ts` test filenames. These tests are correctly located beneath `test/` and use Vitest, but the added names extend the repository's existing `.test.ts` convention rather than the governing spec.

**Resolution:** either rename the new tests to `.spec.ts`, or reconcile the global testing specification with the repository-wide Vitest convention before archive.

## Observations (not counted as confirmed discrepancies)

- `specd.yaml` adds graph exclusions for deleted TypeScript artifacts (`src/infrastructure/generated/guides.ts` and `guides-sdk.ts`). The active generated deliverables are JSON and are already outside the code-language index. The entries are inert but stale configuration; remove them if no longer needed.
- The CLI imports `@specd/guide` / `@specd/guide/sdk`, which is an existing sanctioned dependency required by `cli:guide` and `cli:guide-sdk`. This is a public facade, not a concrete adapter import. It should not be treated as a new violation of the global host-boundary rule without an explicit architecture decision banning the established guide package dependency.
- `loadCatalog` and build tooling may throw native `Error` for corrupt/missing package assets. This is appropriately an unexpected build/package-integrity condition unless product policy chooses to expose it as an expected consumer-facing error.

## Test Coverage

| Area                                                                                         | Evidence                                                                                                                                                              | Assessment                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SDK command parsing, scope/collection, pagination, metadata, errors, search, content slicing | `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts` contains focused cases across all command behavior.                                                          | Strong coverage.                              |
| CLI wiring and documentation registration                                                    | Graph traces `registerGuideSdkCommand` through `createProgram`, CLI entrypoint, and `documentation-coverage.spec.ts`.                                                 | Covered.                                      |
| JSON catalog loading and isolation                                                           | `packages/guide/test/integration/sdk-catalog.test.ts` exercises both engines, catalog isolation, collections, generated symbols, search and engine asset declaration. | Covered in checkout.                          |
| Build roots, frontmatter, headings, offsets, and user-catalog isolation                      | `packages/guide/test/unit/infrastructure/bundle.test.ts`.                                                                                                             | Covered.                                      |
| Workspace/API entry-point distinction                                                        | `packages/guide/test/unit/scripts/workspace-package-roots.test.ts`.                                                                                                   | Covered.                                      |
| Real published artifact without source docs                                                  | Manual pack/extract/import verification passed in the implementation phase.                                                                                           | Manual-only; automated coverage missing (D2). |
| Documentation examples                                                                       | Live CLI execution disproves the `ArtifactDag` examples.                                                                                                              | Failing coverage / discrepancy (D1).          |

## Missing Tests

1. Portable packed-tarball import test for both generated JSON catalogs (D2).
2. Documentation command-example test for `sdk:classes/ArtifactDag`, or generated-topic examples derived from the catalog instead of hard-coded.
3. A test establishing intended behavior and error class for a corrupt/missing packaged JSON asset, if this is meant to be consumer-facing rather than an integrity fault.

## Dependency Chain

```text
sdk-development-guide
├─ cli:guide-sdk
│  ├─ cli:entrypoint ──> core:config
│  └─ default:_global/docs
├─ cli:guide ──> cli:entrypoint, default:_global/docs
├─ guide:bundle-guides ──> guide:conventions, guide:guide-model
├─ guide:composition ──> guide:conventions, guide:guide-model, guide:errors,
│                          guide:list-guides, guide:get-guide, guide:get-guide-outline,
│                          guide:slice-guide-content, guide:search-guides
├─ guide:conventions ──> default:_global/conventions
├─ guide:errors ──> default:_global/error-handling-conventions
└─ default:_global/docs ──> default:_global/conventions

Always-on global constraints reviewed:
default:_global/{architecture,conventions,testing,eslint,continuous-integration,
docs,error-handling-conventions}
```

## Summary Counts

| Category                                  | Count |
| ----------------------------------------- | ----: |
| Global/direct dependency sources reviewed |     8 |
| Requirements met                          |     5 |
| Requirements partially met                |     2 |
| Requirements not applicable to behavior   |     1 |
| Confirmed discrepancies                   |     3 |
| Medium-severity discrepancies             |     2 |
| Low-severity discrepancies                |     1 |
| High-severity discrepancies               |     0 |
| Observations                              |     3 |
| Missing tests                             |     3 |

## Conclusion

The JSON catalog architecture, CLI wiring, error treatment, CI arrangement, and most documentation integration conform to the applicable requirements. Verification cannot be considered fully clean: current published docs and README contain an invalid `ArtifactDag` topic route, publication behavior lacks an automated tarball regression, and the newly introduced test filenames conflict with the global convention. D1 is user-visible and should be corrected before completion.
