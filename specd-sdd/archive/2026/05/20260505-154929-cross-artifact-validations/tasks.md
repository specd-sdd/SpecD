# Tasks: cross-artifact-validations

## 1. Schema model

- [x] 1.1 Extend raw schema parsing for `count` and `crossArtifactValidations`
      `packages/core/src/infrastructure/schema-yaml-parser.ts`: `ValidationRuleRaw`, `ValidationRuleZodSchema`, `ArtifactZodSchema`, `SchemaYamlZodSchema` — add raw cardinality support plus top-level relational validation parsing.
      Approach: extend the existing Zod/raw-model pipeline instead of introducing ad hoc parsing; keep syntax checks in the parser and leave semantic invariants for `build-schema.ts`.
      (Req: Schema file structure, Validation rules, Delta validation rules, Cross-artifact validation rules)

- [x] 1.2 Add domain value objects for relational validation
      `packages/core/src/domain/value-objects/cross-artifact-validation.ts`: new file — define `ValidationCount`, participant, key, relation, and rule interfaces for cross-artifact validation.
      Approach: create dedicated named interfaces/types as described in `design.md`; keep them format-agnostic and pure domain-only.
      (Req: Cross-artifact validation rules)

- [x] 1.3 Expand `ValidationRule` with cardinality metadata
      `packages/core/src/domain/value-objects/validation-rule.ts`: `ValidationRule` — add `count?: ValidationCount` and keep `required` limited to zero-match semantics.
      Approach: model cardinality as one reusable `count` block so top-level and `children` rules share the same contract.
      (Req: Validation rules, Delta validation rules)

- [x] 1.4 Expose relational rules on `Schema`
      `packages/core/src/domain/value-objects/schema.ts`: `Schema` — store and expose `crossArtifactValidations()` alongside artifacts/workflow/metadata.
      Approach: keep `Schema` as the single stable read surface for resolved schema behavior; avoid leaking raw parser output into use cases.
      (Req: Cross-artifact validation rules)

- [x] 1.5 Build semantic schema invariants for relational rules
      `packages/core/src/domain/services/build-schema.ts`: `ValidationRuleRaw`, `buildValidationRule`, `buildSchema()` — convert `count` and relational rules to domain objects and reject invalid combinations.
      Approach: enforce `exactly` vs `min`/`max`, alias uniqueness, `between` alias existence, and same-scope participant invariants in the builder, not in Zod.
      (Req: Array entry identity, Validation rules, Delta validation rules, Cross-artifact validation rules)

- [x] 1.6 Thread expanded validation types through artifact definitions
      `packages/core/src/domain/value-objects/artifact-type.ts`: `ArtifactTypeProps`, `ArtifactType` — keep local validations/deltaValidations typed against the expanded `ValidationRule` contract.
      Approach: preserve current artifact ownership; only widen the type surface needed for `count`.
      (Req: Artifact definition, Validation rules, Delta validation rules)

## 2. Local and relational evaluators

- [x] 2.1 Enforce `count` in the local rule evaluator
      `packages/core/src/domain/services/rule-evaluator.ts`: `evaluateRule()` — evaluate cardinality after selection and before `contentMatches` / `children`.
      Approach: preserve existing zero-match `required` behavior, add count failures for non-zero mismatches, and keep the service pure and artifact-local.
      (Req: Validation rules, Delta validation rules)

- [x] 2.2 Add a pure cross-artifact evaluator
      `packages/core/src/domain/services/cross-artifact-rule-evaluator.ts`: new file — evaluate participant selectors, key extraction, and relation kinds over ready ASTs.
      Approach: implement a second pure pass separate from `rule-evaluator.ts`; derive keys from `label` / `value` / rendered `content`, then apply `capture`, `strip`, and relation semantics.
      (Req: Cross-artifact validation rules)

- [x] 2.3 Support ordered and unordered relational comparison
      `packages/core/src/domain/services/cross-artifact-rule-evaluator.ts`: relation evaluation helpers — implement `all-equal`, `subset`, `superset`, plus `ordering: ignore | strict`.
      Approach: treat unordered mode as set-based; treat strict mode as exact sequence equality for `all-equal` and subsequence-style relative-order preservation for `subset` / `superset`.
      (Req: Cross-artifact validation rules)

## 3. Change-time validation flow

- [x] 3.1 Retain parsed ready artifact outputs during local validation
      `packages/core/src/application/use-cases/_shared/cross-artifact-participant-state.ts`: new file — define `ReadyArtifactParticipant`; `packages/core/src/application/use-cases/validate-artifacts.ts`: local execution state — keep locally valid parsed outputs for a second pass.
      Approach: store merged preview ASTs for `scope: spec` and direct parsed ASTs for `scope: change`; only ready participants enter the relational pass.
      (Req: Structural validation, Cross-artifact structural validation)

- [x] 3.2 Execute cross-artifact rules after local pass in `ValidateArtifacts`
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `execute()` — collect applicable schema relations and run them after the per-artifact loop.
      Approach: reuse the new pure relational evaluator; filter rules by `artifactId` when partial validation is requested; compare merged/materialized outputs for `scope: spec`.
      (Req: Cross-artifact structural validation)

- [x] 3.3 Report deferred cross-artifact validations through existing warnings
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidationWarning`, `ValidateArtifactsResult` assembly — emit non-failing warnings when participants are not yet ready.
      Approach: keep the existing result shape and add one compact deferred notice per skipped relational rule instead of creating a new API channel.
      (Req: Cross-artifact structural validation, Result shape)

- [x] 3.4 Wire any new dependencies through composition
      `packages/core/src/composition/use-cases/validate-artifacts.ts`: `createValidateArtifacts`; `packages/core/src/composition/kernel.ts` if needed — import and assemble any new pure helpers without changing dependency direction.
      Approach: keep manual DI at composition boundaries and avoid introducing I/O into domain services.
      (Req: Ports and constructor, Cross-artifact structural validation)

## 4. Archived spec validation flow

- [x] 4.1 Parse artifacts needed only by relational validation in `ValidateSpecs`
      `packages/core/src/application/use-cases/validate-specs.ts`: `_validateSpec()` — retain ASTs for files with local rules and for files referenced by `crossArtifactValidations`.
      Approach: stop discarding ASTs immediately; gate extra parsing to artifacts that actually participate in a relational rule.
      (Req: Per-spec artifact validation)

- [x] 4.2 Reuse the relational evaluator for archived specs
      `packages/core/src/application/use-cases/validate-specs.ts`: `_validateSpec()` and result aggregation — run the same cross-artifact engine for `scope: spec` rules after local validation.
      Approach: share the evaluator with `ValidateArtifacts` rather than duplicating comparison logic; evaluate per spec only.
      (Req: Per-spec cross-artifact validation)

- [x] 4.3 Surface relational failures and deferred notices in aggregated results
      `packages/core/src/application/use-cases/validate-specs.ts`: `SpecValidationEntry`, `ValidateSpecsResult` assembly — fold relational failures/warnings into the existing entry model.
      Approach: preserve the current result shape, adding relational outcomes to `failures` and deferred notices to `warnings`.
      (Req: Aggregated result)

- [x] 4.4 Wire archived-spec validation composition if constructor wiring changes
      `packages/core/src/composition/use-cases/validate-specs.ts`: `createValidateSpecs`; `packages/core/src/composition/kernel.ts` if needed — update imports/assembly for the shared evaluator.
      Approach: keep constructor wiring explicit and reuse existing parser/schema provider injection.
      (Req: Resolve the active schema, Per-spec cross-artifact validation)

## 5. Automated tests

- [x] 5.1 Add parser tests for schema raw shapes
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: new cases — verify `count`, `crossArtifactValidations`, participants, keys, and relation options parse correctly and malformed shapes fail early.
      Approach: extend existing parser fixtures rather than inventing a separate harness; cover both success and schema-shape rejection paths.
      (Req: Schema file structure, Validation rules, Delta validation rules, Cross-artifact validation rules)

- [x] 5.2 Add builder tests for semantic schema invariants
      `packages/core/test/domain/services/build-schema.spec.ts`: new describe block — reject duplicate aliases, mixed scopes, invalid `between` aliases, and `exactly` + `min/max` combinations.
      Approach: build from already-validated raw input and assert `SchemaValidationError` at semantic-build time.
      (Req: Array entry identity, Validation rules, Cross-artifact validation rules)

- [x] 5.3 Add local evaluator tests for `count`
      `packages/core/test/domain/services/rule-evaluator.spec.ts`: new cases — verify zero-match `required` semantics remain unchanged and `count.exactly` / `min` / `max` enforce cardinality.
      Approach: keep tests focused on the pure evaluator; cover both top-level rules and `children` with `count`.
      (Req: Validation rules, Delta validation rules)

- [x] 5.4 Add pure relational evaluator tests
      `packages/core/test/domain/services/cross-artifact-rule-evaluator.spec.ts`: new file — cover `all-equal`, `subset`, `superset`, ordered vs unordered semantics, and `keySelector`-based nested extraction.
      Approach: test the evaluator in isolation with synthetic ASTs/parsers so failures are not coupled to use-case orchestration.
      (Req: Cross-artifact validation rules)

- [x] 5.5 Add `ValidateArtifacts` integration tests
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`: new scenarios — merged-output comparison, partial `artifactId` execution, deferred warnings, and relational mismatch failures.
      Approach: reuse existing change/spec fixtures, but make one spec-scoped pair intentionally diverge to assert relational failures after local pass.
      (Req: Delta validation, Structural validation, Cross-artifact structural validation, Result shape)

- [x] 5.6 Add `ValidateSpecs` integration tests
      `packages/core/test/application/use-cases/validate-specs.spec.ts`: new scenarios — parse artifacts needed only for relational rules, archived-spec mismatch failures, and deferred notices.
      Approach: assert that `ValidateSpecs` and `ValidateArtifacts` apply the same relation semantics over the same content shape.
      (Req: Per-spec artifact validation, Per-spec cross-artifact validation, Aggregated result)

## 6. Docs and end-to-end verification

- [x] 6.1 Update schema format documentation/ADR
      `docs/adr/0010-schema-format.md`, `docs/schemas/schema-format.md`, `docs/schemas/examples/validations-and-delta-validations.md`: schema ADR, authoring guide, and examples — document `count`, `crossArtifactValidations`, `keySelector`, relation ordering options, and at least one relational example so docs stay aligned with implementation.
      Approach: keep terminology exactly aligned with the new schema field names, replace older exploratory names like `crossValidations`, and ensure the examples demonstrate both local cardinality checks and cross-artifact comparisons.
      (Req: Cross-artifact validation rules)

- [x] 6.2 Re-run change artifact validation and preview after implementation
      `.specd/changes/20260505-154929-cross-artifact-validations/` verification flow — validate `specs`, `verify`, and any implementation changes, then inspect merged previews.
      Approach: run the same `changes validate` / `changes spec-preview` commands listed in `design.md` and confirm the new requirements/scenarios still line up after code changes.
      (Req: Schema file structure, Validation rules, Delta validation rules, Cross-artifact validation rules, Cross-artifact structural validation, Per-spec cross-artifact validation)

- [x] 6.3 Manually verify project-level archived spec validation
      `node packages/cli/dist/index.js specs validate --format text`: end-to-end manual check — confirm archived specs still pass and intentionally broken relational fixtures fail clearly.
      Approach: use real CLI output as the final integration gate for reused `ValidateSpecs` semantics, not only unit tests.
      (Req: Per-spec cross-artifact validation, Aggregated result)

- [x] 6.4 Manually verify partial change-time relational validation
      `node packages/cli/dist/index.js changes validate <fixture-change> <specId> --artifact verify --format text`: partial change validation — confirm relevant cross-artifact rules run when sibling participants are ready and defer with warnings when they are not.
      Approach: exercise both paths with a fixture change so the partial `artifactId` flow proves the same relational engine is reused without inventing a new result channel.
      (Req: Cross-artifact structural validation, Result shape)

## 7. Follow-up from design review

- [x] 7.1 Extend evaluator tests for unique cardinality
      `packages/core/test/domain/services/rule-evaluator.spec.ts`: add cases for `count.unique.by` duplicate-key rejection and `minUnique` / `maxUnique` / `exactlyUnique` bounds.
      Approach: keep these as additive regression tests without rewriting prior completed task history.
      (Req: Validation rules, Delta validation rules)

- [x] 7.2 Add parser coverage for `count.unique` shape
      `packages/core/test/infrastructure/schema-yaml-parser.spec.ts`: add valid/invalid schema parse cases for `count.unique.by` and optional `minUnique` / `maxUnique` / `exactlyUnique`.
      Approach: assert parser-level shape acceptance/rejection only; keep semantic invariants in builder tests.
      (Req: Validation rules, Delta validation rules)

- [x] 7.3 Add builder semantic invariants for unique cardinality
      `packages/core/test/domain/services/build-schema.spec.ts`: reject invalid `count.unique` combinations (`exactlyUnique` with `minUnique`/`maxUnique`) and invalid bound ordering.
      Approach: enforce semantic rules in `build-schema` while keeping Zod validation structural.
      (Req: Validation rules, Delta validation rules)
