# Global Compliance Review — SDK Development Guide

**Scope:** Read-only audit of `default:_global/docs`, `default:_global/conventions`, `default:_global/error-handling-conventions`, and the direct applicability of `core:config` to change `sdk-development-guide`.

**Evidence:** merged change previews for `guide:bundle-guides` and `guide:conventions`; global specs via `specs show`; graph symbol/dependent analysis; implementation and test inspection. The code graph was briefly busy during an automatic re-index, then the graph queries completed successfully.

## Requirements Summary

| Dependency                                   | Applicable requirements                                                                                                       | Assessment                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/docs`                       | Documentation remains under approved `docs/*` roots; public symbols have JSDoc; SDK/integrator material uses the SDK surface. | Applicable. The change consumes approved `docs/guide`, `docs/sdk`, `docs/core`, `docs/code-graph`, `docs/skills`, and `docs/schemas` roots. One JSDoc omission is recorded below. |
| `default:_global/conventions`                | Strict ESM TypeScript, named exports, package boundaries, immutable domain data, and tests under `test/`.                     | Applicable. The JSON catalog adapters preserve the package’s hexagonal port/composition boundary and use the existing named-export ESM pattern.                                   |
| `default:_global/error-handling-conventions` | Expected failures use the SpecD error contract rather than bare `Error`.                                                      | Applicable at the runtime asset boundary; no confirmed expected-error breach found, but corruption handling is untyped (observation below).                                       |
| `core:config`                                | Configuration loading and validation behavior.                                                                                | Not applicable: this change neither reads nor changes `specd.yaml`, configuration ports, nor CLI configuration behavior.                                                          |

## Implementation Status

- **JSON packaging:** `packages/guide/package.json` now declares both `dist/` and `generated/` in `files`, so `generated/guides.json` and `generated/guides-sdk.json` are package deliverables.
- **Runtime isolation:** `PrebundledGuideCatalogAdapter` loads the selected asset from the installed package. `createGuideEngine()` chooses `guides.json`; `createGuideSdkEngine()` chooses `guides-sdk.json`. Neither runtime path parses Markdown, frontmatter, TypeDoc output, or documentation source roots.
- **Layering:** composition creates `PrebundledGuideCatalogAdapter` and `MiniSearchGuideEngineAdapter`, while the adapter implements `GuideCatalogPort`; this retains the existing domain/application/infrastructure separation.
- **Exports and consumers:** the graph identifies `createGuideSdkEngine` as exported through `guide/src/sdk.ts` and consumed by the CLI SDK command and integration tests. Its impact surface is marked CRITICAL, with direct consumers in the CLI SDK command tests and guide integration tests.
- **Build-time documentation work:** `bundle:guides` invokes the bundler and TypeDoc generator at build time. The source roots are all approved documentation directories, and generated topics are collection-qualified.
- **Published-artifact evidence:** the implementation verification preceding this audit packed and extracted `@specd/guide`; both public and SDK engines loaded without documentation source directories (22 user topics and 1319 SDK topics).

## Discrepancies

### D1 — Missing JSDoc on `loadCatalog` (low severity)

`packages/guide/src/infrastructure/adapters/prebundled-guide-catalog-adapter.ts` declares the non-exported `loadCatalog` function without JSDoc. `default:_global/docs` requires JSDoc on all functions, not only public exports. The surrounding constructor and class are documented, but that does not satisfy the function-level requirement.

**Recommended resolution:** add a concise JSDoc block describing the packaged JSON load, its parameter, return shape, and invalid-catalog failure.

### D2 — No automated packed-artifact regression test (medium severity)

The merged `guide:bundle-guides` verification scenario requires that a packed `@specd/guide` artifact, without documentation source directories, can import both entry points and resolve both engines. Manual evidence exists and passed, but the repository test inventory has no test that executes `npm pack` (or an equivalent tarball/install/extract flow). Therefore future changes to `package.json#files`, build output layout, or adapter-relative paths can regress this required behavior without a test failure.

**Recommended resolution:** add a portable integration test that packs/extracts the package into a temporary directory and imports `dist/public.js` and `dist/sdk.js`; it should assert both catalog engines load while source docs are unavailable.

## Observations (not counted as confirmed discrepancies)

- `loadCatalog` and the build-time API configuration reader throw native `Error` for malformed/missing local artifacts. A corrupted generated asset is normally a build/package integrity failure, so it may be classified as an unexpected system failure. If product behavior instead treats it as an expected consumer-facing runtime condition, these errors should become package-specific `SpecdGuideError` subclasses with uppercase codes.
- The user-catalog isolation unit test compares TypeScript-module rendering (`renderCatalogModule`) for user-only versus all collections. The merged requirement names byte-for-byte stability of the emitted JSON asset. The current test gives useful content-isolation coverage but not exact serialized-JSON regression coverage.

## Test Coverage

| Area                                                 | Evidence                                                                                                                                                         | Result                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Generated JSON files and build order                 | `package.json` runs `bundle:guides` before `tsup`; `files` includes `generated/`.                                                                                | Covered by implementation inspection; published-artifact manual check passed. |
| Separate catalogs and runtime isolation              | `test/integration/sdk-catalog.test.ts` creates both engines; user engine contains only `guide`, SDK engine serves curated collections and generated API symbols. | Covered.                                                                      |
| Frontmatter, headings, offsets, collection isolation | `test/unit/infrastructure/bundle.test.ts`.                                                                                                                       | Covered for validation/parser behavior and logical user-collection isolation. |
| Curated API roots versus workspace roots             | `test/unit/scripts/workspace-package-roots.test.ts`.                                                                                                             | Covered.                                                                      |
| CLI SDK behavior                                     | graph dependents include `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts`.                                                                               | Covered outside the guide package; not rerun in this read-only audit.         |
| Real package contents and source-free import         | manual `npm pack`/extract/import result from the implementation phase.                                                                                           | Passed manually; not automated.                                               |

## Missing Tests

1. A portable packed-artifact test for both JSON catalogs (D2).
2. A byte-for-byte comparison of emitted `guides.json` with and without SDK collection compilation, rather than comparison through `renderCatalogModule`.
3. A malformed/missing generated JSON asset test that establishes whether runtime failures are expected domain errors or intentionally untyped integrity failures.

## Spec Dependency Chain

```text
sdk-development-guide
├─ guide:bundle-guides (merged)
│  ├─ guide:conventions
│  └─ guide:guide-model
├─ guide:conventions (merged)
│  ├─ default:_global/conventions
│  └─ default:_global/error-handling-conventions
└─ default:_global/docs
   └─ docs/{guide,sdk,core,code-graph,skills,schemas} source-root constraints

core:config — reviewed; no code/configuration dependency from this change.
```

## Summary Counts

| Category                                                  |                          Count |
| --------------------------------------------------------- | -----------------------------: |
| Applicable global/direct dependency specs reviewed        |                              3 |
| Non-applicable direct dependency specs reviewed           |              1 (`core:config`) |
| Confirmed discrepancies                                   |                              2 |
| High-severity discrepancies                               |                              0 |
| Medium-severity discrepancies                             |                              1 |
| Low-severity discrepancies                                |                              1 |
| Observations requiring product classification             |                              2 |
| Missing regression tests                                  |                              3 |
| Functional packaging/runtime checks with passing evidence | 1 manual packed-artifact check |

## Conclusion

The JSON catalog design is conformant with the applicable global architecture, documentation-location, ESM/package-boundary, and zero-runtime-documentation-parsing requirements. The published-artifact behavior has passing manual evidence. Compliance is not fully clean due to the missing JSDoc on `loadCatalog` and the absence of an automated packed-artifact regression test.
