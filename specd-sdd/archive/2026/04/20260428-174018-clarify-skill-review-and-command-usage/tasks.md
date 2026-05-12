# Tasks: clarify-skill-review-and-command-usage

## 1. Shared workflow policy updates

- [x] 1.1 Add command-equivalence and freshness policy to shared template
      `packages/skills/templates/shared/shared.md`: shared command guidance sections — add deterministic equivalence mapping rule, conditional command-skip gates, and mandatory re-read behavior when context freshness is uncertain
      Approach: centralize normative rules in shared template, with `--format toon` preference for extraction and explicit fallback semantics; define skip conditions as “equivalent fields + fresh context” only
      (Req: Diagnostic Priority, Data Extraction, Command Necessity and Freshness)

- [x] 1.2 Add structural-vs-semantic review guardrails to shared template
      `packages/skills/templates/shared/shared.md`: validation/review sections — clarify that `changes validate` is structural-state gating and cannot replace semantic content review; require `changes spec-preview` for overlap/drift risk checkpoints
      Approach: introduce explicit “MUST NOT treat validate as semantic approval” wording and mandatory merged-preview checkpoint language
      (Req: Structural Validation and Content Review, Drift and overlap review support)

## 2. Skill-specific command rationalization

- [x] 2.1 Update entrypoint and discovery skills to canonical commands and minimal safe reads
      `packages/skills/templates/specd/SKILL.md` and `packages/skills/templates/specd-new/SKILL.md`: command examples and sequencing — use canonical plural groups and remove duplicated reads where equivalent fresh outputs already exist
      Approach: apply deterministic equivalence map per step; preserve safety-critical status/context reads when equivalence is not provable
      (Req: Canonical Command References, Workflow equivalence mapping)

- [x] 2.2 Update design and implement skills with freshness-aware re-read minima
      `packages/skills/templates/specd-design/SKILL.md` and `packages/skills/templates/specd-implement/SKILL.md`: execution discipline and read strategy — define minimum mandatory re-reads for standalone invocation, record `[hasTasks]` from initial status, and reuse design impact analysis during implementation
      Approach: anchor context reuse on fingerprint checks, carry task-bearing artifact IDs from the initial status, and run new graph impact checks only when implementation discovers targets not covered by design or stale scope
      (Req: Command Necessity and Freshness, Workflow equivalence mapping)

- [x] 2.3 Update verify and archive skills for preview safety and non-redundant checks
      `packages/skills/templates/specd-verify/SKILL.md` and `packages/skills/templates/specd-archive/SKILL.md`: review and finalization steps — require merged preview for overlap/drift risk and remove duplicated checks not adding new signal
      Approach: preserve mandatory checks for blockers/approvals while replacing redundant reads with equivalent-field reuse rules only when auditable
      (Req: Structural Validation and Content Review, Drift and overlap review support)

## 3. Spec and verify artifact alignment

- [x] 3.1 Apply spec deltas for workflow-automation contract updates
      `.specd/changes/20260428-174018-clarify-skill-review-and-command-usage/deltas/skills/workflow-automation/spec.md.delta.yaml`: requirements — keep command necessity/freshness and structural-vs-semantic review rules coherent with template changes
      Approach: ensure requirement text remains normative and maps directly to skill-template behavior
      (Req: Command Necessity and Freshness, Structural Validation and Content Review)

- [x] 3.2 Apply CLI spec deltas for validate and preview semantics
      `.specd/changes/20260428-174018-clarify-skill-review-and-command-usage/deltas/cli/change-validate/spec.md.delta.yaml` and `.specd/changes/20260428-174018-clarify-skill-review-and-command-usage/deltas/cli/change-spec-preview/spec.md.delta.yaml`: command contracts — reflect structural-only validate semantics and preview checkpoint obligations
      Approach: align canonical command references and explicit workflow interpretation constraints without changing runtime CLI behavior
      (Req: Structural validation scope, Drift and overlap review support)

- [x] 3.3 Apply command-resource-naming spec delta for workflow equivalence map
      `.specd/changes/20260428-174018-clarify-skill-review-and-command-usage/deltas/cli/command-resource-naming/spec.md.delta.yaml`: requirement set — extend canonical-display scope and deterministic mapping requirement
      Approach: codify auditable skip logic in naming-adjacent workflow contract so command-elision policy is testable
      (Req: Help and docs canonical display, Workflow equivalence mapping)

- [x] 3.4 Keep verify deltas synchronized with new requirements
      `.specd/changes/20260428-174018-clarify-skill-review-and-command-usage/deltas/**/verify.md.delta.yaml`: scenarios — ensure every new/modified requirement has scenario coverage
      Approach: maintain one-to-one traceability from each requirement to at least one scenario and preserve heading structure expected by schema validators
      (Req: all updated verify requirements across 4 specs)

## 4. Documentation and examples

- [x] 4.1 Update CLI reference with structural-vs-semantic clarification
      `docs/cli/cli-reference.md`: validate and preview documentation — state that validate success is structural/state-only and content review remains required
      Approach: mirror spec language, keep user-facing wording concise, and avoid implying semantic approval from validation pass
      (Req: Structural validation scope, Structural Validation and Content Review)

- [x] 4.2 Normalize docs command examples to canonical plural groups
      `docs/cli/cli-reference.md` and any touched workflow docs under `docs/guide/`: command snippets — prefer `changes/specs/archives/drafts` as primary forms
      Approach: update examples to canonical names and mention singular forms only as aliases where needed
      (Req: Help and docs canonical display, Canonical Command References)

## 5. Tests and end-to-end validation

- [x] 5.1 Add/adjust CLI tests for validate semantics messaging
      `packages/cli/test/commands/change-validate.spec.ts`: output expectations — cover wording that distinguishes structural validation from semantic review
      Approach: update assertions in success/failure flows to ensure no semantic-approval implication is emitted
      (Req: Structural validation scope)

- [x] 5.2 Add/adjust CLI tests for preview checkpoint semantics
      `packages/cli/test/commands/change/spec-preview.spec.ts`: guidance/output contract tests — ensure preview behavior remains aligned with merged-review checkpoint requirements
      Approach: extend scenario coverage around artifact filtering and diff/merged outputs where workflow safety semantics are surfaced
      (Req: Drift and overlap review support)

- [x] 5.3 Add/adjust skill-template regression checks
      `packages/skills` test/snapshot suite (or nearest existing harness): generated instruction outputs — verify canonical commands, freshness gates, and deterministic equivalence rules appear in rendered skills
      Approach: snapshot or golden-output comparison for updated templates to prevent regressions across future template edits
      (Req: Command Necessity and Freshness, Workflow equivalence mapping, Canonical Command References)

- [x] 5.4 Run manual workflow checks for non-sequential skill execution
      Local workflow run using `node packages/cli/dist/index.js ...`: simulate skills invoked in separate moments/sessions and confirm required re-reads occur when freshness is unknown
      Approach: execute representative command chains with and without prior context fingerprint; verify skip decisions remain safe and auditable
      (Req: Command Necessity and Freshness, Structural Validation and Content Review)
