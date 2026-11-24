# Compliance audit partial — CLI, global docs/testing, guide, and skills

Delegated verification attempt: `verification-attempt-2`  
Change: `reconcile-lifecycle-transitions-with-main`  
Scope: `cli:entrypoint`, `default:_global/testing`, `default:_global/docs`, `guide:conventions`, `skills:workflow-automation`

## Executive summary

- Specs audited: **5**
- Requirements audited: **52**
- Verification scenarios audited: **135**
- Requirements conformant: **52**
- Requirements partially conformant: **0**
- Requirements non-conformant: **0**
- Missing or materially insufficient tests: **0**
- Dependency/global-spec contradictions: **0**
- Findings requiring code or spec changes: **0**

The merged change previews are internally consistent and conform to their global and direct-dependency constraints. The implementation, tests, package manifests, generated workflow templates, and documentation coverage checks provide evidence for every requirement in this batch. No discrepancy was found between intended behavior and implementation.

## Audit method and evidence

- Used the merged artifacts returned by `changes spec-preview`; all five specs are `no-op` relative to their current bases, so verification assessed the effective merged contract rather than raw deltas.
- Confirmed the code graph was current (`stale: false`, complete coverage, no parse failures).
- Used graph impact as the primary navigation surface. Risk classification was CRITICAL for `cli:entrypoint`, HIGH for `guide:conventions`, MEDIUM for `default:_global/docs` and `skills:workflow-automation`, and LOW for `default:_global/testing`.
- Inspected implementation and test surfaces identified by the graph, including CLI program/error/table helpers, CLI documentation/configuration coverage tests, the guide domain/application/infrastructure suites, and workflow-template parity/behavior tests.
- Executed focused verification suites:
  - CLI evidence: **4 files, 129 tests passed** (`handle-error`, table helper, documentation coverage, configuration coverage). The requested nonexistent `test/program.spec.ts` path was ignored by Vitest and is not counted.
  - Guide package: **7 files, 58 tests passed**.
  - Skills evidence: **3 files, 34 tests passed**.
- Confirmed manifest boundaries: `@specd/cli` and `@specd/mcp` depend directly on `@specd/sdk`, not `@specd/core` or `@specd/code-graph`; `@specd/guide` has no SpecD workspace dependency.
- A broad multi-term graph search hit a graph-backend OOM after the required impact queries had succeeded. This did not affect scope discovery or conclusions because focused graph impact, direct evidence inspection, and tests completed successfully.

## Detailed findings

### `cli:entrypoint`

**Requirements summary:** 16 requirements; 40 scenarios.

**Implementation status: conformant.**

- Configuration discovery, global/local `--config` propagation, bare-command dashboard dispatch, root-only banner behavior, the top-level `init` alias, excess-argument rejection, and reusable `createProgram()` are implemented in the CLI program/bootstrap surfaces.
- Exit-code and stream contracts are centralized in `handleError`; typed SpecD errors produce structured JSON/TOON on stdout while preserving plain diagnostic stderr. Hook failures map to code 2 and system failures to code 3.
- `renderTable`/`fitColumnsToTerminal` implement the right-to-left width reduction, minimum-width, wrap/truncate, and non-TTY behavior.
- Root banner labels are fed CLI, SDK, core, and code-graph versions through the SDK-facing boundary.
- Dynamic documentation coverage traverses the command tree and checks dedicated reference docs, the CLI index, and the guide overview. Configuration documentation coverage introspects the schema and cascade semantics.
- Host dependency boundary is satisfied by the CLI and MCP manifests.

**Test coverage:** adequate. Direct evidence includes `packages/cli/test/handle-error.spec.ts`, `packages/cli/test/helpers/table.spec.ts`, `packages/cli/test/documentation-coverage.spec.ts`, `packages/cli/test/configuration-coverage.spec.ts`, plus graph-linked command/integration coverage for root program behavior. The focused suite passed 129 tests.

**Discrepancies:** none.

**Dependency consistency:** consistent with `core:config` and `default:_global/error-handling-conventions`; no competing discovery, error, or host-import contract was found.

### `default:_global/testing`

**Requirements summary:** 8 requirements; 15 scenarios.

**Implementation status: conformant.**

- Package test scripts and Vitest configurations use Vitest and conventional `test/` locations/suffixes.
- Domain/application tests use typed port substitutes; infrastructure suites exercise real adapter boundaries with cleanup.
- Cross-platform cases are represented explicitly, including CRLF handling in guide slicing and the previously added Windows lock/path/index failure coverage in core/code-graph.
- Test fixtures use OS-derived temporary paths and avoid depending on POSIX-only permission behavior for Windows assertions.
- No snapshot-based acceptance evidence was used for the audited behavior.

**Test coverage:** adequate. This global policy is enforced by package conventions, lint/type checking, and the package suites; the focused guide tests include an explicit CRLF scenario, while the full verification hooks cover the repository-wide suite.

**Discrepancies:** none.

**Dependency consistency:** consistent with `default:_global/architecture` and `default:_global/conventions`; unit/integration placement follows the declared layer boundaries and ESM/Vitest constraint.

### `default:_global/docs`

**Requirements summary:** 12 requirements; 38 scenarios.

**Implementation status: conformant.**

- User guides, CLI references, SDK entry points, package references, ADR conventions, and public composition surfaces are present in their required locations and governed by repository coverage checks.
- CLI command/reference coverage is dynamically derived from `createProgram()`, preventing undocumented command families/subcommands and stale CLI indexes.
- Configuration documentation coverage compares current schema keys, defaults, graph/logging/plugin options, overrides, and cascade semantics with the guide.
- ESLint contains active JSDoc rules for exported/public symbols and required descriptions/parameters/returns.
- Guide opening and skills-catalog expectations are represented in CLI/guide tests and documentation surfaces.
- No removed variable, renamed list/summary contract, or CLI output change in this batch lacks corresponding documentation.

**Test coverage:** adequate. Principal evidence is `packages/cli/test/documentation-coverage.spec.ts`, `packages/cli/test/configuration-coverage.spec.ts`, guide bundle/frontmatter tests, and repository lint/JSDoc enforcement.

**Discrepancies:** none.

**Dependency consistency:** consistent with `default:_global/conventions`; naming, Markdown placement, and formatting rules do not conflict with the merged documentation contract.

### `guide:conventions`

**Requirements summary:** 5 requirements; 13 scenarios.

**Implementation status: conformant.**

- The package maintains domain/application/port/infrastructure/composition separation and exposes clean public entry points.
- `packages/guide/package.json` has no dependency on SpecD workspace packages; bundling is a build-time concern rather than a runtime core dependency.
- Guide domain errors extend `SpecdGuideError`, satisfy the duck-typed SpecD error contract, and do not inherit from `@specd/core`.
- Manifest/build/test/lint scripts and package deliverables are present; the README describes architecture, catalog, and quick start.

**Test coverage:** adequate. All **58 guide tests passed**, covering error hierarchy, domain models, application queries/slicing, bundle/frontmatter compilation, search, and end-to-end guide-engine behavior.

**Discrepancies:** none.

**Dependency consistency:** this spec declares no direct spec dependencies and remains compatible with the global architecture, testing, documentation, and error-handling policies.

### `skills:workflow-automation`

**Requirements summary:** 11 requirements; 29 scenarios.

**Implementation status: conformant.**

- Shared/template guidance uses canonical plural resource groups and text status diagnostics, prefers TOON for structured extraction, and limits JSON to explicit exceptions.
- `specs show`, `specs context`, and `specs metadata` have distinct documented roles; outline retrieval uses `specs outline` on demand.
- Transition failures follow the emitted repair guide rather than forcing retries.
- Structural validation is kept separate from semantic review; inline validation diffs, filtered diff previews, and merged previews are selected according to the stated risk conditions.
- Verify/compliance templates encode explicit attempt ownership. Delegated compliance remains change-scoped downstream and neither starts nor completes the caller's attempt.
- Implementation tracking requires explicit resolve/ignore before archive.
- Context optimization routes to the project/spec optimizer agents when agents are supported and documents the inline fallback otherwise.
- Generated/installed skill copies are checked for protocol parity with their source templates.

**Test coverage:** adequate. The three focused files passed **34 tests**. `template-workflow.spec.ts` directly asserts read-surface guidance, canonical reconciliation, verification ownership, delegated downstream routing, open-file draining, and optimizer gates; `generated-skill-protocol.spec.ts` checks installed-copy parity; repository tests validate rendered bundles.

**Discrepancies:** none.

**Dependency consistency:** consistent with all declared direct dependencies: `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, and `core:transition-checks`. No template instruction contradicts canonical resource naming, context/metadata separation, reconciled status, structural validation, or recovery precedence.

## Test coverage and missing tests

| Spec                         | Requirements | Scenarios | Status         | Missing tests |
| ---------------------------- | -----------: | --------: | -------------- | ------------: |
| `cli:entrypoint`             |           16 |        40 | Conformant     |             0 |
| `default:_global/testing`    |            8 |        15 | Conformant     |             0 |
| `default:_global/docs`       |           12 |        38 | Conformant     |             0 |
| `guide:conventions`          |            5 |        13 | Conformant     |             0 |
| `skills:workflow-automation` |           11 |        29 | Conformant     |             0 |
| **Total**                    |       **52** |   **135** | **Conformant** |         **0** |

Some global-policy scenarios are enforced through lint, manifest constraints, dynamic coverage tests, or workflow-template assertions rather than one test named identically to each scenario. The evidence is nevertheless direct and behaviorally sufficient; no additional test gap was identified.

## Spec dependency chain

- `cli:entrypoint` → `core:config`, `default:_global/error-handling-conventions`.
- `default:_global/testing` → `default:_global/architecture`, `default:_global/conventions`.
- `default:_global/docs` → `default:_global/conventions` (and references `core:config` in its ADR guidance).
- `guide:conventions` → no declared direct dependency.
- `skills:workflow-automation` → `cli:command-resource-naming`, `skills:agents`, `cli:spec-context`, `cli:spec-metadata`, `core:get-status`, `core:validate-artifacts`, `core:transition-checks`.

All checked edges are semantically compatible with the merged requirements.

## Final disposition

**PASS.** This batch contains no implementation defect, spec drift, documentation inconsistency, dependency contradiction, or missing-test finding. No code/spec change is recommended.
