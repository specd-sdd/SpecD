# Final compliance audit partial — core hygiene specifications

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, and `core:config-writer-port`  
**Method:** read-only comparison of fresh merged previews, implementation, tests, direct dependencies, global architecture constraints, and relevant user documentation.  
**Graph:** current; no stale/fingerprint mismatch.

## Requirement status

| Spec                        | Requirement / focus                                                                                                       | Result      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `core:hook-execution-model` | Exactly three hook forms: `instruction:`, `run:`, `external:`.                                                            | Conformant. |
| `core:schema-format`        | Plugins cannot declare or mutate `metadataExtraction`; external hook constraint includes all forms.                       | Conformant. |
| `core:change`               | Task completion is restricted to declared task-capable artifacts.                                                         | Conformant. |
| `core:get-status`           | Schema-not-found status remains read-only, has no available transitions, and returns `SCHEMA_RESOLUTION_FAILED` publicly. | Conformant. |
| `core:config-writer-port`   | Initialization does not synthesize optional/unrelated plugin configuration.                                               | Conformant. |

## Prior-P2 reconciliation

### Three hook forms, including external — resolved

The merged preview replaces “Two hook types” with “Three hook entry forms,” enumerates `instruction:`, `run:`, and `external:`, and requires exactly one of those keys. The dependent `core:schema-format` constraint was also changed to permit exactly one of `instruction`, `run`, or `external`. There is no residual two-form/two-key contract.

Implementation matches: the YAML parser maps `external:` into `HookEntry { type: 'external' }` (`packages/core/src/infrastructure/schema-yaml-parser.ts:232-244`); `RunStepHooks` dispatches external hooks to accepted-type runners. Parser coverage accepts the external form (`packages/core/test/infrastructure/schema-yaml-parser.spec.ts:251-267`); run-hook coverage exercises accepted runner dispatch and failure for an unavailable type (`packages/core/test/application/use-cases/run-step-hooks.spec.ts:173-223`). The merged verify scenario also covers the unavailable-runner path.

### Plugin metadata-extraction prohibition and documentation — resolved

The merged preview removes `metadataExtraction` from the schema-plugin MAY list, explicitly prohibits declaration or mutation, and identifies transforms/resolved layers as the allowed extension points. Parser refinement rejects a plugin that declares the field (`packages/core/src/infrastructure/schema-yaml-parser.ts:330-352`), with a focused test at `packages/core/test/infrastructure/schema-yaml-parser.spec.ts:144-147`.

User documentation is aligned: `docs/guide/configuration.md:715` and `docs/config/config-reference.md:454` say a plugin cannot declare a top-level extraction block. No conflicting MAY clause remains in the merged spec.

### Actionable schema-resolution blocker — resolved

The merged `core:get-status` requirement now distinguishes the empty `lifecycle.blockers` projection (checks cannot run without a schema) from the public `blockers` array, which must include stable `SCHEMA_RESOLUTION_FAILED` recovery guidance. Its verify scenario asserts the same separation and read-only/no-mutation behavior.

`GetStatus` returns that public blocker when schema resolution raises `SchemaNotFoundError` (`packages/core/src/application/use-cases/get-status.ts:393-407`). The regression test asserts empty available transitions plus the exact blocker code/message (`packages/core/test/application/use-cases/get-status.spec.ts:292-307`). The merged spec no longer requires the public blockers array to be empty or degradation to be silent. `GetStatus` remains a CRITICAL graph surface (10 direct, 4 indirect dependents), so this focused coverage is material.

## Remaining scope confirmation

### Task completion scope

`buildSchema` restricts `requiresTaskCompletion` to artifacts with `hasTasks: true` and rejects invalid references (`packages/core/src/domain/services/build-schema.ts:725-743`). Tests cover rejection without capability and acceptance with capability (`packages/core/test/domain/services/build-schema.spec.ts:407-492`). This conforms to `core:workflow-model`, `core:lifecycle-engine`, and `core:transition-checks` semantics.

### Optional ConfigWriter configuration

`FsConfigWriter.initProject` writes schema/workspace configuration only and does not create a plugin block (`packages/core/src/infrastructure/fs/config-writer.ts:39-82`). `addPlugin` keeps optional configuration absent until supplied (`:91-119`). Initialization and configured/unconfigured plugin behavior are covered in `packages/core/test/infrastructure/fs/config-writer.spec.ts:39-59, 146-172`. The port/infrastructure split conforms to `default:_global/architecture`; graph impact is MEDIUM (2 direct, 2 indirect dependents for `FsConfigWriter`).

## Test coverage and dependency review

- All five change-scoped clarifications have focused implementation evidence and relevant unit coverage.
- Direct dependencies are consistent: hook execution and schema-format both recognize the same three forms; schema-plugin behavior matches parser and user docs; task gating matches lifecycle contracts; status remains read-only and transition validation remains fail-closed.
- The change-level verification has already recorded a passing full `pnpm test` run; this read-only audit made no code/spec changes and did not rerun it.

## Totals

- Scoped clarifications audited: **5**
- Prior P2 contradictions confirmed removed: **3/3**
- Conformant requirements: **5/5**
- Runtime implementation discrepancies: **0**
- Specification contradictions: **0**
- Missing targeted tests: **0**
- P0: **0**; P1: **0**; P2: **0**; P3: **0**
