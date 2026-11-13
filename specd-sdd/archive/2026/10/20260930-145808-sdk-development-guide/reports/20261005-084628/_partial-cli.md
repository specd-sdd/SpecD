# CLI and global-documentation compliance audit — `sdk-development-guide`

## Scope and method

Reviewed the merged change artifacts for `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture`; followed their direct CLI/guide dependencies into the current implementation and documentation. Graph state was current at audit time (1,207 indexed source files, 42,541 symbols). Graph impact marks `guideSdkCmd` CRITICAL (15 affected files through command, formatter, config/error, guide-engine, and test paths) and `registerGuideSdkCommand` MEDIUM (root program, entrypoint, and focused tests).

## Requirements evidence and implementation status

| Requirement area                                                                                                                                                                   | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:guide-sdk`: registered command, bounded catalog, independent scope/collection filters, index, retrieval, section/window, search, structured formats and guide-specific errors | Compliant        | `packages/cli/src/commands/guide-sdk/index.ts` validates scopes/collections, delegates all guide operations to `GuideEngine`, formats via shared renderers, and maps expected errors to typed CLI output. Runtime JSON listing showed `topics`, `pagination`, per-collection ranges, scope, and withheld-API disclosure; API+collection filtering returned the expected bounded envelope. |
| `cli:entrypoint`: config/exit/output/error/help/excess-argument conventions and lazy catalog load                                                                                  | Compliant        | `program.ts:267-269` registers the adapter with a memoized dynamic `import('@specd/guide/sdk')`; command actions call `loadConfig`; `handle-error.ts` emits standard stderr and JSON/TOON payloads. A built-CLI excess-positional smoke check exited 1. Help exposes the schema and has no root banner.                                                                                   |
| `cli:guide`: additive SDK discovery and sibling-compatible listing envelope                                                                                                        | Compliant        | `commands/guide/index.ts` defines the structured SDK discovery payload, while the shared formatter emits it in every output format. `node packages/cli/dist/index.js guide --format json` returned the unchanged guide envelope plus `sdkGuide` with `specd guide-sdk` and all five collections.                                                                                          |
| Global architecture: direct guide dependency remains a thin delivery adapter                                                                                                       | Compliant        | The merged global architecture now explicitly permits `@specd/cli -> @specd/guide` for this delivery adapter, requires delegation rather than reimplementation, and permits the lazy `/sdk` subpath. The CLI implementation follows that boundary.                                                                                                                                        |
| Global docs: command reference, CLI directory, scenario recipe, and sidebar navigation                                                                                             | Compliant        | `docs/cli/guide-sdk.md` is a dedicated command/search reference and distinguishes `guide` from `guide-sdk`; `docs/cli/index.md`, `docs/guide/cli.md`, and `apps/public-web/sidebars.ts` list/link the command. `docs/core/sdk.md` is absent, consistent with the tombstone requirement.                                                                                                   |
| Global docs: `docs/guide/index.md` points readers to the SDK guide                                                                                                                 | **Noncompliant** | See F1.                                                                                                                                                                                                                                                                                                                                                                                   |

## Findings

### F1 — `docs/guide/index.md` lacks the required SDK guide pointer

- **Severity:** Medium
- **Type:** Documentation/spec conformance gap
- **Requirement:** `default:_global/docs` — “SDK guide documentation and discoverability” requires `docs/guide/index.md` to point readers to the SDK guide.
- **Evidence:** The complete current `docs/guide/index.md` contains the user-guide catalog and terminal quick-help block but no `guide-sdk`, “SDK guide”, or SDK/extension-development reference. Targeted search found the command in `docs/guide/cli.md`, `docs/cli/guide-sdk.md`, `docs/cli/index.md`, and the public-web sidebar, but not in the required guide landing page.
- **Impact:** Integrators beginning from the primary guides overview have no route to the package-reference/API catalog, despite other discovery surfaces being correct.
- **Recommendation:** Add a concise SDK/integrator callout or link in `docs/guide/index.md` pointing to `specd guide-sdk` and the dedicated `docs/cli/guide-sdk.md` reference, clearly distinguishing it from the user-facing `specd guide` collection. Add a regression assertion to documentation coverage.

## Tests and scenario coverage

- `pnpm --filter @specd/cli exec vitest run test/commands/guide-sdk/guide-sdk.spec.ts` — **PASS**, 1 file / **72 tests**. Covers catalog filtering/order/pagination, hidden generated API notice, index/meta, topic inspection, generated topic behavior, slicing, search, unknown-topic suggestion/error shape, output formats, root registration, and lazy engine resolution.
- `pnpm --filter @specd/cli exec vitest run test/documentation-coverage.spec.ts` — **PASS**, 1 file / **31 tests**. Confirms command registration/documentation coverage, but does not assert the semantic landing-page discoverability requirement in F1.
- Built CLI smoke checks — **PASS**:
  - `guide-sdk --format json --page-size 2` returned the required bounded structured listing and hidden generated-topic reveal command.
  - `guide --format json` returned `sdkGuide` as a structured additive field.
  - both `guide-sdk --help` and `guide --help` state the sibling/SDK relationship and output contracts.
  - `guide-sdk core:ports unexpected` returned exit code 1 for an excess positional.

## Dependency consistency

`CLI entrypoint -> createProgram -> registerGuideSdkCommand -> lazy @specd/guide/sdk import -> createGuideSdkEngine -> GuideEngine -> prebundled SDK catalog/search adapters -> shared CLI formatters/error/config route`.

The existing user-guide route remains separate: `createProgram -> registerGuideCommand -> user GuideEngine -> shared formatter + sdkGuide discovery`. The direct `@specd/guide` dependency and lazy SDK subpath are now explicitly sanctioned by the merged architecture spec, and the adapter does not reimplement guide-domain behavior.

## Summary

- Merged specs/global requirements reviewed: **5**
- Functional CLI discrepancies: **0**
- Documentation discrepancies: **1 medium** (F1)
- Focused CLI tests: **72 passed**
- Documentation-coverage tests: **31 passed**
- Built-command smoke checks: **4 passed**
