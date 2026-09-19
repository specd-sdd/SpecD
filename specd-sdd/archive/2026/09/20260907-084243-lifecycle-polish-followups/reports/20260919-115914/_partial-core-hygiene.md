# Compliance audit partial — core hygiene specifications

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, and `core:config-writer-port`  
**Audit type:** change-scoped, read-only; merged change previews were compared with production code, tests, direct dependencies, and project-wide architecture constraints.  
**Graph:** current (`2026-09-07T08:56:52.791Z`, no stale or fingerprint-mismatch indication).

## Requirements summary

| Spec                        | Change-scoped clarification                                                                                                    | Status                            | Evidence                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core:hook-execution-model` | A schema has only `instruction:` and `run:` forms; external dispatch is a matching-effect execution mechanism.                 | **Inconsistent**                  | The merged preview retains the older “External hooks are explicit workflow entries” requirement, defining `external: { type, config }` as an additional form. Runtime supports this older model. |
| `core:schema-format`        | `metadataExtraction` is declarative; plugins do not mutate that declaration at runtime.                                        | **Inconsistent**                  | The merged preview retains the older statement that a `schema-plugin` MAY declare `metadataExtraction`; parser rejects it.                                                                       |
| `core:change`               | Task completion applies only to `hasTasks: true` artifacts with a declared completion check.                                   | **Conformant**                    | Schema construction enforces `requiresTaskCompletion` only for `hasTasks` artifacts; lifecycle checks use the declared workflow check.                                                           |
| `core:get-status`           | Schema-resolution degradation is read-only, has no available transitions, and exposes an actionable schema-resolution blocker. | **Non-conformant / inconsistent** | Production catches only `SchemaNotFoundError` and returns `blockers: []`; the retained older requirement also demands empty blockers and silent degradation.                                     |
| `core:config-writer-port`   | Initialization and plugin operations validate only required configuration and do not create unrelated plugin entries.          | **Conformant**                    | `FsConfigWriter.initProject` creates schema/workspace configuration only; `addPlugin` writes a configuration payload only when supplied.                                                         |

## Detailed findings

### HYG-001 — External hooks remain a third schema form

- **Spec:** `core:hook-execution-model`
- **Category:** specification inconsistency / incomplete hygiene reconciliation
- **Severity:** P2
- **Status:** open
- **Evidence:** The new merged requirement says external dispatch is not a third schema hook type. The retained requirements “External hooks are explicit workflow entries” and “External hooks follow workflow phase semantics” instead define an `external: { type, config }` entry in addition to `instruction:` and `run:`. Production confirms the latter interpretation: `RunStepHooks` has tests for explicit external hooks and for `ExternalHookTypeNotRegisteredError` (`packages/core/test/application/use-cases/run-step-hooks.spec.ts:207`); `GetHookInstructions` treats explicit external hooks as a non-instruction type (`packages/core/test/application/use-cases/get-hook-instructions.spec.ts:124`).
- **Impact:** The archive would preserve mutually exclusive schema guidance. Schema authors cannot tell whether `external` is valid YAML structure or only a runner backend.
- **Resolution options:**
  1. Make `external` an actual third entry form and replace the new clarification accordingly; or
  2. Redesign the external model so it decorates a `run:` entry, then update parsing/runtime/tests.  
     The present code and tests support option 1, so a spec-only correction is the low-risk choice.

### HYG-002 — Schema-plugin metadata extraction contract still conflicts with the parser

- **Spec:** `core:schema-format`
- **Category:** specification inconsistency / implementation-to-spec drift
- **Severity:** P2
- **Status:** open
- **Evidence:** The retained “Schema plugin kind” requirement says a schema-plugin **MAY** declare `metadataExtraction` (`specs/core/schema-format/spec.md:422`). The parser rejects it: `SchemaYamlZodSchema` requires `s.metadataExtraction === undefined` for `kind: schema-plugin` and reports that it must not declare the field (`packages/core/src/infrastructure/schema-yaml-parser.ts:335-348`). The new requirement correctly says a plugin must not mutate the extraction declaration at runtime, but it does not replace the older MAY statement, so it does not resolve the contradiction.
- **Tests:** The parser suite covers schema-plugin restrictions (`packages/core/test/infrastructure/schema-yaml-parser.spec.ts:133+`) and plugin operations (`:523+`). A focused test specifically asserting rejection of `metadataExtraction` on a schema-plugin was not found in this scoped audit.
- **Resolution options:**
  1. Align the spec to current parser behavior: plugins may contribute transforms/resolved layers but may not declare `metadataExtraction`; add the focused rejection test.
  2. Change parser and merge logic to support a declarative plugin metadata extraction contract.  
     Existing parser behavior and the stated hygiene intent favor option 1.

### HYG-003 — Degraded GetStatus now promises a blocker that is neither produced nor consistent with the retained requirement

- **Spec:** `core:get-status`
- **Category:** implementation discrepancy and intra-spec contradiction
- **Severity:** P1
- **Status:** open
- **Evidence:** The added requirement requires an actionable schema-resolution blocker. In `GetStatus.execute`, the `SchemaNotFoundError` path preserves `availableTransitions = []` but returns `blockers: transitionBlockers`, initialized as an empty array (`packages/core/src/application/use-cases/get-status.ts:380-435`). The existing retained “Graceful degradation when schema resolution fails” requirement also explicitly requires `blockers` to be empty and says the use case degrades silently. The existing regression test only asserts empty artifact/transition/check projections (`packages/core/test/application/use-cases/get-status.spec.ts:292-302`), not a blocker.
- **Impact:** CLI/API consumers cannot reliably give the proposed schema repair guidance; documentation contains two incompatible public contracts. `GetStatus` is graph-rated CRITICAL with 10 direct and 4 indirect dependents, including kernel composition and SDK host context.
- **Resolution options:**
  1. Preserve present behavior and edit the new clarification to say that degradation is intentionally silent/no-blocker; or
  2. Implement a stable schema-resolution `LifecycleBlocker`, update the retained older requirement, and add tests for its code/message and for mutation remaining fail-closed.  
     This cannot be closed as a documentation-only change without choosing one contract.

## Conformant requirements and evidence

### `core:change` — Task completion scope

`buildSchema` defaults `hasTasks` to `false` and validates each `requiresTaskCompletion` ID both belongs to the step's requirements and references an artifact with task capability (`packages/core/src/domain/services/build-schema.ts:526-544, 725-743`). The schema-format dependency independently defines `hasTasks` as the master switch and repeats the same invariant. Existing lifecycle/status/transition tests exercise task-capable artifacts and count projection, including `GetStatus` tests at `packages/core/test/application/use-cases/get-status.spec.ts:344-389` and `:451+`.

### `core:config-writer-port` — Optional initialization and plugin configuration

`FsConfigWriter.initProject` builds only the schema and requested workspace configuration (`packages/core/src/infrastructure/fs/config-writer.ts:39-65`) and does not synthesize `plugins`. `addPlugin` writes `{ name }` when configuration is absent and `{ name, config }` only when configuration is explicitly provided (`:91-119`). The filesystem test suite verifies initialization structure and absence of a storage block (`packages/core/test/infrastructure/fs/config-writer.spec.ts:39-59`), adds an unconfigured plugin as only `{ name }` (`:146-154`), and covers configured update without duplication (`:156-172`). Graph impact rates `ConfigWriter` MEDIUM (3 direct, 1 indirect dependent).

## Test coverage assessment

| Clarification                       | Coverage                                                                                 | Assessment                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Hook forms/external dispatch        | Explicit-external runtime tests exist, but they validate the retained third-form model.  | Does not validate the new clarification; blocked by HYG-001 contract conflict.          |
| Metadata extraction/plugin boundary | General schema-plugin restriction tests exist.                                           | Partial; add an explicit `metadataExtraction` rejection test after contract resolution. |
| Task completion scope               | Build-schema and lifecycle/status/transition tests cover `hasTasks` and declared checks. | Adequate.                                                                               |
| Degraded schema status              | One test covers non-throwing degradation and empty transitions.                          | Insufficient for the new blocker requirement; also encodes neither contract choice.     |
| Optional ConfigWriter setup         | Initialization and configured/unconfigured plugin tests exist.                           | Adequate.                                                                               |

The change-level verification already recorded a passing full `pnpm test` run (14 Turbo tasks successful). This audit did not change code or rerun that suite.

## Dependency and consistency review

- `core:hook-execution-model` directly depends on `core:workflow-model`, `core:schema-format`, hook runner/use-case specs, and transition/archive CLI specs. Its new two-form statement conflicts with both its own retained external-entry requirements and the direct schema-format dependency's explicit external-entry requirement.
- `core:schema-format` depends on `core:delta-format`, `core:selector-model`, `core:content-extraction`, and `core:schema-merge`. The plugin declaration conflict is local to schema-format but directly affects parser/merge consumers.
- `core:change` depends on `core:workflow-model`, `core:lifecycle-engine`, and `core:transition-checks`; the new task-scope wording is consistent with those semantics.
- `core:get-status` depends on `core:change`, `core:schema-format`, `core:lifecycle-engine`, `core:transition-checks`, and composition/count-task support. The schema failure contract conflicts internally; no direct dependency requires the new blocker as written.
- `core:config-writer-port` depends on `core:config` and `default:_global/architecture`; its clarification conforms to the port/infrastructure separation and present behavior.

## Totals

- Change-scoped clarifications audited: **5**
- Conformant: **2**
- Non-conformant or internally inconsistent: **3**
- Implementation bugs requiring a behavior decision: **1** (HYG-003)
- Spec-only contradictions suitable for low-risk correction: **2** (HYG-001, HYG-002)
- Test gaps: **2** targeted assertions (schema-plugin metadata extraction rejection; chosen GetStatus schema-failure public contract)
- P0: **0**; P1: **1**; P2: **2**; P3: **0**
