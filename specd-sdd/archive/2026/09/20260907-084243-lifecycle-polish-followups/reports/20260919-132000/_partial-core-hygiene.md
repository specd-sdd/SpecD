# Fresh compliance audit partial — core hygiene specifications

**Change:** `lifecycle-polish-followups`  
**Scope:** `core:hook-execution-model`, `core:schema-format`, `core:change`, `core:get-status`, `core:config-writer-port`  
**Method:** read-only, change-scoped audit of merged `spec-preview` content, production source, tests, user documentation, direct dependencies, and global architecture rules.  
**Graph:** current at `2026-09-19T10:36:14.237Z`; no stale/fingerprint mismatch.

## Requirements summary

| Spec                        | Change-scoped requirement                                                                                  | Implementation/test status                                        | Compliance status                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `core:hook-execution-model` | Exactly three entry forms: `instruction:`, `run:`, `external:`.                                            | Parser, `HookEntry`, dispatch, and tests support all three.       | **P2 internal spec inconsistency remains.** |
| `core:schema-format`        | A plugin must not declare/mutate `metadataExtraction`; transforms/resolved layers remain extension points. | Parser rejects the declaration; focused test and user docs exist. | **P2 internal spec inconsistency remains.** |
| `core:change`               | Only declared `hasTasks: true` task-capable artifacts may gate task completion.                            | Builder validation and tests conform.                             | Conformant.                                 |
| `core:get-status`           | Schema failure yields read-only status, no available transitions, and a stable actionable blocker.         | `SCHEMA_RESOLUTION_FAILED` is produced and asserted.              | **P2 internal spec inconsistency remains.** |
| `core:config-writer-port`   | Initialization does not synthesize unrelated plugin configuration.                                         | FS implementation and tests conform.                              | Conformant.                                 |

## Findings

### HYG-R1 — Three-form hook contract was added but the previous two-form invariant was not replaced

- **Spec(s):** `core:hook-execution-model`; direct dependency `core:schema-format`
- **Category:** intra-spec and dependency-spec contradiction
- **Severity:** P2
- **Evidence:** The merged change preview adds “Three hook entry forms” and its scenario correctly declares `instruction:`, `run:`, and `external:`. Runtime agrees: the parser maps `external:` to `HookEntry { type: 'external' }` (`packages/core/src/infrastructure/schema-yaml-parser.ts:232-244`), and `RunStepHooks` dispatches it through registered runners (`packages/core/src/application/use-cases/run-step-hooks.ts:294-306`). Tests cover parser acceptance (`packages/core/test/infrastructure/schema-yaml-parser.spec.ts:251-267`), successful dispatch (`packages/core/test/application/use-cases/run-step-hooks.spec.ts:173-205`), and an unregistered type failure (`:207+`).

  However, the retained `core:hook-execution-model` requirement still says hooks come in “exactly two types” and that _every_ entry declares exactly one of `instruction:` or `run:` (`specs/core/hook-execution-model/spec.md:9-18`), while its following retained requirement says `external` is an additional entry (`:20-32`). The direct `core:schema-format` constraint likewise says every entry has `instruction` or `run` (`specs/core/schema-format/spec.md:492`), excluding `external` despite its own explicit-external-hook requirement.

- **Impact:** The implementation and new scenario are correct, but the archived public contracts would remain mutually exclusive for schema authors.
- **Suggested remediation:** Replace—not append—the old two-form/two-key wording and amend the schema-format constraint to enumerate all three forms. No runtime change is indicated.

### HYG-R2 — Plugin metadata-extraction prohibition is implemented and documented, but contradicts the retained schema-plugin list

- **Spec:** `core:schema-format`
- **Category:** intra-spec contradiction
- **Severity:** P2
- **Evidence:** The merged change preview correctly adds “A schema plugin MUST NOT declare or mutate `metadataExtraction`.” Parser refinement enforces `s.metadataExtraction === undefined` for `kind: schema-plugin` (`packages/core/src/infrastructure/schema-yaml-parser.ts:330-352`); the focused rejection test is present at `packages/core/test/infrastructure/schema-yaml-parser.spec.ts:144-147`. User documentation is aligned: `docs/guide/configuration.md:715` and `docs/config/config-reference.md:454` both say plugins cannot declare a top-level extraction block, and ADR 0010 says the same (`docs/adr/0010-schema-format.md:90-112`).

  The retained “Schema plugin kind” list nevertheless still says a plugin **MAY** declare `metadataExtraction` (`specs/core/schema-format/spec.md:414-423`).

- **Impact:** The public spec is internally contradictory even though parser, test, and user-facing documentation agree on the intended prohibition.
- **Suggested remediation:** Remove `metadataExtraction` from that MAY list (or replace the entire list with the final allowed set). No implementation change is indicated.

### HYG-R3 — Actionable schema-resolution blocker is implemented and tested, but conflicts with the retained silent-degradation contract

- **Spec:** `core:get-status`
- **Category:** intra-spec contradiction
- **Severity:** P2
- **Evidence:** The new merged requirement/scenario requires no available transitions plus an actionable schema-resolution blocker. On `SchemaNotFoundError`, `GetStatus` now returns `SCHEMA_RESOLUTION_FAILED` with a recovery message (`packages/core/src/application/use-cases/get-status.ts:393-407`), while preserving the read-only no-transition projection. The focused regression assertion checks the exact blocker code/message and empty available transitions (`packages/core/test/application/use-cases/get-status.spec.ts:292-307`).

  The retained “Graceful degradation when schema resolution fails” requirement still requires `blockers` to be empty and says degradation occurs silently (`specs/core/get-status/spec.md:217-229`).

- **Impact:** This is a CRITICAL graph surface (`GetStatus`: 10 direct, 4 indirect dependents, including kernel composition and SDK host context). Consumers now receive the right actionable behavior, but the versioned specification exposes incompatible contracts.
- **Suggested remediation:** Replace the old empty-blocker/silent clauses with the new blocker contract. Do not revert runtime behavior; the new scenario and test provide the desired public behavior.

## Conformant requirements

### `core:change` — Task completion scope

`buildSchema` defaults `hasTasks` to false and rejects a `requiresTaskCompletion` reference unless it targets an artifact with task capability (`packages/core/src/domain/services/build-schema.ts:526-544, 725-743`). Tests reject an ungated artifact (`packages/core/test/domain/services/build-schema.spec.ts:407-423`), reject explicit `hasTasks: false` (`:453-472`), and accept the `hasTasks: true` path (`:474-492`). This agrees with `core:schema-format` and lifecycle/transition dependencies.

### `core:config-writer-port` — Optional initialization and plugin configuration

`FsConfigWriter.initProject` creates only schema/workspace configuration and does not write `plugins` (`packages/core/src/infrastructure/fs/config-writer.ts:39-65`). `addPlugin` emits `{ name }` without optional configuration and writes configuration only when supplied (`:91-119`). The FS test suite verifies initial configuration shape (`packages/core/test/infrastructure/fs/config-writer.spec.ts:39-59`) plus unconfigured and configured plugin behavior (`:146-172`). This conforms to `core:config` and `default:_global/architecture` port/infrastructure layering.

## Test coverage

| Requirement                            | Evidence                                                                                          | Assessment                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Three hook forms                       | Parser external-form test; registered/unregistered external-runner tests; merged verify scenario. | Adequate for behavior; spec replacement remains needed.         |
| Plugin metadata-extraction prohibition | Focused parser rejection test and aligned user docs.                                              | Adequate for behavior/documentation; stale MAY clause remains.  |
| Task completion scope                  | Builder validation tests for false/true capability and declared gating.                           | Adequate.                                                       |
| Schema-resolution blocker              | Focused exact-code/message regression test and merged verify scenario.                            | Adequate for behavior; stale silent-degradation clause remains. |
| Optional ConfigWriter configuration    | Initialization, unconfigured addition, configured update tests.                                   | Adequate.                                                       |

No missing runtime tests were identified in this scoped batch. The three findings are specification-replacement gaps, not untested behavior.

## Dependency and global-consistency review

- `core:hook-execution-model` depends directly on `core:schema-format`, hook execution/use-case specs, and transition/archive paths. The new three-form contract agrees with runtime, but the old two-key constraints in both specs need synchronized replacement.
- `core:schema-format` depends on schema merge/selector/content-extraction contracts. Its corrected prohibition agrees with parser, user documentation, and ADR 0010; only the retained MAY list conflicts.
- `core:change` is consistent with `core:workflow-model`, `core:lifecycle-engine`, and `core:transition-checks` task-gating semantics.
- `core:get-status` is consistent with its read-only architecture and transition fail-closed behavior. Its blocker behavior is an additive status projection, not a mutation bypass.
- `core:config-writer-port` remains within the global hexagonal architecture: port in application, filesystem/YAML work in infrastructure, composition factory for delivery access.

## Totals

- Scoped clarifications audited: **5**
- Runtime behavior conformant: **5**
- Test coverage adequate: **5**
- User-documentation alignment checked: **metadata plugin prohibition conforms**
- Open findings: **3** specification contradictions (all P2)
- Runtime implementation bugs: **0**
- Missing runtime tests: **0**
- P0: **0**; P1: **0**; P2: **3**; P3: **0**
