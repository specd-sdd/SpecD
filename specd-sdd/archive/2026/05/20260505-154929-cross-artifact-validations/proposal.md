# Proposal: cross-artifact-validations

## Motivation

The current schema-driven validation model is strong at single-artifact structural checks, but it cannot express important consistency rules that span multiple artifacts or richer internal constraints like uniqueness. This becomes a problem now because the repository already relies on paired `spec.md` and `verify.md` artifacts, yet some of the most important guarantees between them are documented conventions rather than first-class validation rules.

## Current behaviour

Today, `schema.yaml` supports `validations` and `deltaValidations`, and both are evaluated against a single AST root at a time. `ValidateArtifacts` enforces those rules during change validation, and `ValidateSpecs` applies the same artifact-local model to archived/project specs, but neither use case has an explicit way to compare one artifact against another or to express cardinality and uniqueness constraints beyond existence-oriented matching.

## Proposed solution

Extend the schema validation model so it can define and enforce cross-artifact consistency rules alongside richer intra-artifact structural constraints. The intended outcome is a schema-driven way to describe rules such as requirement mirroring between `spec.md` and `verify.md`, duplicate-section prevention, and similar consistency checks without hardcoding one-off validators outside the schema system.

The current direction is to treat cross-artifact rules as first-class relational rules rather than forcing them to live under one artifact arbitrarily. These rules should only be evaluated after the local structural validations of the participating artifacts have passed, so that cross-artifact checks operate on artifacts that already exist and are structurally parseable.

## Specs affected

### New specs

None.

### Modified specs

- `core:schema-format`: extend the schema contract so authors can declare cross-artifact validation and stronger structural constraints such as uniqueness and requirement mirroring.
  - Depends on (added): none

- `core:validate-artifacts`: change the validation execution model so change-time artifact validation can evaluate the new cross-artifact and richer structural rules.
  - Depends on (added): none

- `core:validate-specs`: expand project/spec validation so archived specs can be checked with the same new validation capabilities where applicable.
  - Depends on (added): none

## Impact

The main impact is in the validation pipeline in `@specd/core`, especially around rule evaluation, schema parsing, and the two validation use cases. Likely code areas include `packages/core/src/domain/services/rule-evaluator.ts`, `packages/core/src/application/use-cases/validate-artifacts.ts`, `packages/core/src/application/use-cases/validate-specs.ts`, and `packages/core/src/infrastructure/schema-yaml-parser.ts`, with follow-on updates to tests and schema documentation.

## Technical context

Discovery established that the existing model is artifact-local by construction: `rule-evaluator.ts` evaluates rules against one root node, while `ValidateArtifacts` and `ValidateSpecs` validate one artifact at a time. The repository documentation already states that `verify.md` requirement headings should mirror `spec.md`, and that pairing is central to the spec layout, so the missing capability is not conceptual alignment but enforceable schema semantics.

This change should remain schema-driven rather than introducing bespoke validation logic for one file pair. The current validation chokepoints are still the right architectural home for enforcement, and code graph impact analysis showed `rule-evaluator.ts` and `validate-artifacts.ts` as high-risk integration points, so the design should prefer an explicit rule model extension over an ad hoc patch.

Current design direction:

- Cross-artifact checks should be modeled as relational/global structural rules, not as local rules attached arbitrarily to `specs` or `verify`.
- Local artifact validations should always run first.
- Cross-artifact validations should run only after all participating artifacts exist and have already passed their own local structural validation.
- Cross-artifact rules are structural, not content-review semantics; human review remains a separate concern.
- Missing participating artifacts should defer a cross-artifact rule rather than fail it prematurely.
- The first version should support relationships only between artifacts belonging to the same spec. Broader cross-spec or change-wide relations are out of scope for now.
- The first version should support relationships only between artifacts that belong to the same spec and the same scope.
- For `scope: spec` artifacts, cross-artifact validation should operate on the merged/materialized artifact outputs, not on raw delta files or unmodified base files.
- Mixed-scope relations are out of scope because `scope: change` artifacts represent only the current change, while `scope: spec` artifacts are validated against the merged full-spec result; comparing those two views directly would produce non-equivalent structural checks.
- The current `required` rule semantics should be treated as absence handling for zero matches, not as a general cardinality mechanism. New intra-artifact cardinality features are needed for uniqueness and min/max/exact match counts.
- Intra-artifact cardinality should be modeled through a reusable `count` construct with `exactly`, `min`, and `max`.
- `min` and `max` should be combinable; `exactly` should be mutually exclusive with both.
- Each `count` block should allow at most one `min` and one `max` field.
- Validation selectors should continue to allow multiple matches by default; cardinality constraints should be enforced by `count`, not by changing selector semantics.
- Nested `children` rules should continue to use the same rule and selector model as top-level validation rules; only the evaluation root changes to the matched parent node.
- Cross-artifact schema structure should be designed around `participants` rather than a strictly binary `source`/`target` pair, so future rules can relate N artifacts without breaking the schema shape.
- Each cross-artifact participant should identify an artifact plus a selector-derived node set, reusing the existing selector model as much as possible.
- Cross-artifact participants should support an optional `keySelector` that runs relative to each node matched by the main participant `selector`, so key extraction can reuse the selector model for nested structures across markdown, YAML, JSON, and future formats.
- When `keySelector` is omitted, keys should be extracted directly from the nodes matched by the main participant `selector`.
- Cross-artifact comparison semantics should live in a separate relation/operator block rather than overloading local validation-rule semantics.
- The top-level schema field for relational validation should be `crossArtifactValidations`.
- Requirement mirroring should not be modeled as a special-purpose feature; it should be expressible as `all-equal` with the appropriate ordering option.
- `ValidateSpecs` should execute the same `crossArtifactValidations` engine for archived/project specs wherever the rule applies to `scope: spec` artifacts, reusing the same underlying evaluation machinery as `ValidateArtifacts` rather than duplicating logic.
- During partial artifact validation, `crossArtifactValidations` should run as soon as all required participants for a rule are available and have already passed their local structural validation.
- When a cross-artifact rule cannot yet run because one or more required participants are missing or not locally valid, validation output should report that the rule was deferred rather than silently omitting it.

### Working model examples

These examples are exploratory and are included to preserve the current design direction for later evaluation. They are not yet final schema syntax.

#### Intra-artifact cardinality example

Example intent: a single `Requirement: Login` section must exist exactly once.

```yaml
validations:
  - id: unique-login-requirement
    selector:
      type: section
      matches: '^Requirement: Login$'
      parent:
        type: section
        matches: '^Requirements$'
    count:
      exactly: 1
```

Example intent: each requirement must have between 1 and 3 scenarios.

```yaml
validations:
  - id: requirement-scenarios
    selector:
      type: section
      matches: '^Requirement:'
    children:
      - id: scenarios
        selector:
          type: section
          matches: '^Scenario:'
        count:
          min: 1
          max: 3
```

#### Cross-artifact markdown-to-markdown example

Example intent: `specs` and `verify` of the same spec expose the same requirement IDs.

```yaml
crossArtifactValidations:
  - id: mirrored-requirements
    scope: spec
    participants:
      - artifact: specs
        as: specRequirements
        selector:
          type: section
          matches: '^Requirements$'
        keySelector:
          type: section
          matches: '^Requirement:'
        key:
          from: label
          capture: '\\[([^\\]]+)\\]$'
      - artifact: verify
        as: verifyRequirements
        selector:
          type: section
          matches: '^Requirements$'
        keySelector:
          type: section
          matches: '^Requirement:'
        key:
          from: label
          capture: '\\[([^\\]]+)\\]$'
    relation:
      kind: all-equal
      between:
        - specRequirements
        - verifyRequirements
```

#### Cross-artifact markdown-to-yaml example

Example intent: a markdown requirements artifact and a YAML artifact expose the same set of IDs.

```yaml
crossArtifactValidations:
  - id: requirement-ids-covered
    scope: spec
    participants:
      - artifact: specs
        as: specRequirements
        selector:
          type: section
          matches: '^Requirements$'
        keySelector:
          type: section
          matches: '^Requirement:'
        key:
          from: label
          capture: '\\[([^\\]]+)\\]$'
      - artifact: model
        as: yamlRequirements
        selector:
          type: sequence-item
          parent:
            type: pair
            matches: '^requirements$'
        keySelector:
          type: pair
          matches: '^id$'
        key:
          from: value
    relation:
      kind: subset
      between:
        - specRequirements
        - yamlRequirements
```

#### Cross-artifact markdown list example

Example intent: extract keys from a markdown list by selecting the list as the participant scope and each list item as the key source.

```yaml
crossArtifactValidations:
  - id: listed-ids-match
    scope: change
    participants:
      - artifact: tasks
        as: taskIds
        selector:
          type: list
        keySelector:
          type: list-item
        key:
          from: label
          strip: '^[0-9]+\\.\\s*'
      - artifact: checklist
        as: checklistIds
        selector:
          type: list
        keySelector:
          type: list-item
        key:
          from: label
          strip: '^[0-9]+\\.\\s*'
    relation:
      kind: all-equal
      between:
        - taskIds
        - checklistIds
```

### Current implementation implications

The current understanding of the validation pipeline is:

1. Validate each artifact locally using the existing per-artifact validation model.
2. For `scope: spec`, materialize merged outputs before running any cross-artifact rule.
3. Once every participant artifact needed by a cross-artifact rule is present and locally valid, derive participant key sets.
4. Evaluate the relation/operator over those key sets.

This implies cross-artifact evaluation is a second structural pass, not a replacement for local validation.

### Cross-artifact operator semantics

The current direction is to keep cross-artifact operators small, generic, and defined over participant key sets rather than over format-specific AST semantics. The operator should not understand markdown headings, YAML pairs, or JSON properties directly; selectors and key extraction produce normalized comparable keys, and the operator works only on those keys.

Working operator definitions:

- `all-equal`
  - Input: two or more participant key sets
  - Meaning: every participant key set must contain exactly the same keys
  - Example: `specs` requirements and `verify` requirements must match one-to-one by key

- `subset`
  - Input: an ordered `between` list where the first participant is the source set and the second is the containing set
  - Meaning: every key in the first participant must exist in the second participant
  - Example: every requirement declared in `specs` must appear in a YAML `requirements` array

- `superset`
  - Input: an ordered `between` list where the first participant is the containing set and the second is the subset
  - Meaning: every key in the second participant must exist in the first participant
  - Example: the first participant is required to include all keys declared by the second

Current evaluation assumptions:

- Participant key sets are treated as sets, not ordered lists.
- Duplicate keys inside a participant are not the responsibility of the operator; they should be handled by local intra-artifact validation such as `count`.
- `all-equal` is symmetric.
- `subset` and `superset` are directional and must respect the order declared in `between`.
- If a participant produces zero keys, that zero-key set still participates in operator evaluation once the underlying artifacts are available and locally valid.
- Cross-artifact operations should own their own options block rather than using flat top-level relation fields. This keeps operation-specific semantics grouped with the operation that interprets them.
- One important operation option is ordering mode:
  - unordered/set-based comparison for cases where writing order is irrelevant
  - ordered comparison for cases such as tasks or step lists where writing order matters
- For `all-equal`, ordered comparison means exact sequence equality.
- For `subset` and `superset`, ordered comparison should mean relative-order preservation (subsequence semantics), not exact positional equality.
- The initial v1 operator set should be limited to `all-equal`, `subset`, and `superset`, each with per-operation options such as ordering mode. Additional operator kinds are out of scope for this first iteration.

Worked examples:

```yaml
relation:
  kind: all-equal
  options:
    ordering: ignore
  between:
    - specRequirements
    - verifyRequirements
```

Meaning:

- `keys(specRequirements) == keys(verifyRequirements)`

```yaml
relation:
  kind: subset
  options:
    ordering: ignore
  between:
    - specRequirements
    - yamlRequirements
```

Meaning:

- `keys(specRequirements) ⊆ keys(yamlRequirements)`

```yaml
relation:
  kind: superset
  options:
    ordering: ignore
  between:
    - yamlRequirements
    - specRequirements
```

Meaning:

- `keys(yamlRequirements) ⊇ keys(specRequirements)`

```yaml
relation:
  kind: all-equal
  options:
    ordering: strict
  between:
    - taskIds
    - checklistIds
```

Meaning:

- `sequence(taskIds) == sequence(checklistIds)`

## Open questions

None for proposal scope. Remaining work is design-level detail inside the agreed direction above.
