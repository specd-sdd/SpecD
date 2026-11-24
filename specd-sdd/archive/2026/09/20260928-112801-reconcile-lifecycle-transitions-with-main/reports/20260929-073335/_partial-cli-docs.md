# Compliance audit — CLI, testing, documentation, guide, and workflow automation

Delegated verification attempt: `verification-attempt-1`  
Change: `reconcile-lifecycle-transitions-with-main`  
Scope: `cli:entrypoint`, `cli:change-transition`, `default:_global/testing`, `default:_global/docs`, `guide:conventions`, `skills:workflow-automation`

## Requirements Summary

The six merged specs contain 68 requirements and 181 verification scenarios. All change deltas except `cli:entrypoint` are intentional no-ops: they retain the existing normative contract while reconciling implementation, generated metadata, package layout, documentation topology, and workflow templates after the merge. `cli:entrypoint` adds the explicit reusable `createProgram(): Command` contract.

| Spec                         | Requirements | Scenarios | Compliance result |
| ---------------------------- | -----------: | --------: | ----------------- |
| `cli:entrypoint`             |           16 |        40 | Compliant         |
| `cli:change-transition`      |           15 |        48 | Compliant         |
| `default:_global/testing`    |            8 |        15 | Compliant         |
| `default:_global/docs`       |           13 |        36 | Compliant         |
| `guide:conventions`          |            5 |        13 | Compliant         |
| `skills:workflow-automation` |           11 |        29 | Compliant         |

## Implementation Status

### `cli:entrypoint`

Implemented. `packages/cli/src/program.ts` owns the reusable `createProgram()` factory, assembles the complete Commander tree, installs root banner/config propagation/default dashboard behavior, and returns without parsing arguments. `packages/cli/src/index.ts` is now a thin process adapter: it exports the factory, creates the program, parses `process.argv`, and delegates errors to `handleError`. The factory registers `changes transition`, verification, implementation tracking, and `guide` exactly once. `packages/cli/test/documentation-coverage.spec.ts` proves that the returned tree is introspectable without process execution and dynamically checks the command/documentation topology. Existing entrypoint, error, and table tests cover the rest of the merged contract.

### `cli:change-transition`

Implemented and unchanged semantically. Registration moved intact from the former monolithic entrypoint into `createProgram()`. The transition handler remains delegated to the core transition/status/hook contracts, including `--next`, explicit target selection, hook selectors, progress presentation, repair guidance, incomplete-task checks, and structured output behavior. The no-op delta accurately describes a registration/metadata reconciliation rather than a behavioral change.

### `default:_global/testing`

Implemented. The root test matrix includes all workspace packages and CI runs on macOS, Ubuntu, and Windows. Tests remain under package `test/` trees and use Vitest. The merged Windows compatibility work uses OS-derived paths, normalized path assertions, cross-platform spawning/hook translation, and newline normalization. The focused suites exercised CLI, guide, and skills behavior without snapshots; the previously completed full repository gate additionally exercised the cross-platform core/code-graph suites.

### `default:_global/docs`

Implemented. User-facing material is under `docs/guide`, command reference material is under `docs/cli`, and developer/API material remains in the designated package/core/SDK locations. New CLI families have dedicated pages (`config`, `discarded`, `drafts`, `graph`, `guide`, `plugins`, `schema`, `specs`, `storage`, etc.). `documentation-coverage.spec.ts` introspects `createProgram()` and enforces a dedicated command-family page, subcommand mentions, guide coverage, and CLI index coverage. `configuration-coverage.spec.ts` dynamically checks the guide against the exported configuration schemas and cascade operations. The reconciled links point to the canonical configuration guide rather than obsolete locations.

### `guide:conventions`

Implemented. `@specd/guide` is a standalone publishable package with only `minisearch` as a runtime dependency and no dependency on `@specd/core` or any other SpecD package. Its public surface exports domain models/errors, application ports/utilities, and the composition facade. Domain, application, infrastructure, and composition directories preserve the hexagonal boundary. Build-time guide bundling is explicit; package scripts cover build, development, typecheck, test, and lint; the package README documents architecture and usage.

### `skills:workflow-automation`

Implemented. The shared and agent-instruction templates encode graph-first research, guide-first documentation lookup, canonical plural resource groups, text-first lifecycle diagnostics, TOON-first structured extraction, exact `specs show` versus semantic `specs context` versus diagnostic `specs metadata`, on-demand outlines, merged `spec-preview` review, canonical status recovery, verification-attempt ownership/delegation, explicit implementation tracking resolution, and optimizer-agent policy. The generated `.agents`/`.codex` skills reflect those templates, including delegated compliance using the outer attempt without starting or completing it.

## Discrepancies

No compliance discrepancies were found.

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

The only tooling anomaly was an `rtk` wrapper exit status of 1 for `pnpm --filter @specd/guide typecheck`, while the wrapper simultaneously reported “TypeScript: No errors found” and warned that this filter form was unsupported. Re-running the package-local command as `pnpm --dir packages/guide typecheck` exited 0. This is command-wrapper behavior, not a product or spec discrepancy.

## Test Coverage

Focused verification executed during this audit:

| Evidence                                                                                 | Result                    |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| CLI transition, documentation coverage, configuration coverage, and guide-command suites | 4 files, 142 tests passed |
| CLI entrypoint, error handling, and terminal-table suites                                | 3 files, 58 tests passed  |
| Complete `@specd/guide` suite                                                            | 7 files, 58 tests passed  |
| Skills workflow/template rendering suites                                                | 2 files, 20 tests passed  |
| `@specd/guide` lint                                                                      | Passed                    |
| `@specd/guide` package-local typecheck                                                   | Passed                    |

Total focused evidence: 16 test files and 278 passing tests, plus lint and typecheck. The outer implementation run also recorded successful repository-wide test, lint, typecheck, and build gates; this audit did not substitute that declaration for its own focused execution.

Coverage is requirement-aligned:

- Entrypoint process behavior, error streams/codes, formatting, banner, terminal sizing, and factory introspection are exercised by the CLI entrypoint/error/table and documentation-coverage suites.
- Transition command signature, resolution, status delegation, hook behavior, progress, structured output, and repair paths are exercised by the 94-test transition suite contained in the 142-test CLI batch.
- Documentation topology and configuration accuracy are enforced dynamically against the live command tree and Zod schemas.
- Guide architecture, errors, models, queries, slicing, search, bundle generation, and integration are covered by all seven guide suites.
- Workflow template propagation and canonical instruction content are covered by skills template tests.
- Cross-platform policies are backed by the full repository run and the imported Windows compatibility tests across core, CLI, and code graph.

## Missing Tests

No blocking missing tests were identified for this change scope. The `createProgram()` scenario is directly exercised through construction and traversal by `documentation-coverage.spec.ts`; importing and invoking it without argument parsing provides the required non-exiting introspection surface. The no-op specs preserve already-covered contracts, and their relevant existing suites passed.

Optional hardening, not a compliance gap: add a narrowly named unit test whose title exactly mirrors “Factory returns executable Commander instance without argument parsing.” Current behavioral coverage is equivalent but distributed between `documentation-coverage.spec.ts` and the thin `index.ts` adapter.

## Spec Dependency Chain

- `cli:entrypoint` → `core:config`; `default:_global/error-handling-conventions`.
- `cli:change-transition` → `cli:entrypoint`; `core:change`; `core:transition-change`; `core:hook-execution-model`; `core:get-status`; `core:transition-checks`.
- `default:_global/testing` → `default:_global/architecture`; `default:_global/conventions`.
- `default:_global/docs` → `default:_global/conventions`.
- `guide:conventions` → no declared dependencies; it is the package-wide constraint root.
- `skills:workflow-automation` → `cli:command-resource-naming`; `skills:agents`; `cli:spec-context`; `cli:spec-metadata`; `core:get-status`; `core:validate-artifacts`; `core:transition-checks`.

The merged requirements are mutually consistent. In particular, the plural command registration in `createProgram()` matches workflow automation; the guide package has the zero-Core boundary required by its conventions; documentation introspection uses the decoupled CLI factory; and transition behavior continues to delegate canonical lifecycle validity and recovery decisions to Core rather than duplicating them in CLI code or skill prose.

## Numeric Summary

- Specs audited: 6
- Direct dependency specs reviewed for consistency: 17 references, 15 unique dependency specs
- Requirements audited: 68
- Verification scenarios reviewed: 181
- Requirements compliant: 68
- Requirements partially compliant: 0
- Requirements non-compliant: 0
- Discrepancies: 0
- Blocking missing tests: 0
- Focused tests passed: 278
- Focused test failures: 0
- Lint/typecheck failures attributable to product code: 0
- Overall result: **PASS**
