# Proposal: show-spec-diff-during-validate

## Motivation

Reviewing a single spec delta currently requires two separate steps: structural validation with `changes validate`, then merged-content review with `changes spec-preview`. Now that core already supports diff generation for spec previews, that extra step is redundant in the common single-artifact validation flow and slows review down.

## Current behaviour

`specd changes validate` acts as a structural and lifecycle-state gate. For spec-scoped artifacts it validates the expected delta or direct file, reports notes/failures, and then tells the operator to run `specd changes spec-preview` to inspect merged content separately.

This means the user reviewing one spec delta must switch commands to see what actually changed after merge. The workflow guidance in `packages/skills` reinforces that pattern by telling agents to validate first and then run `spec-preview` for merged review. The current UX is correct but unnecessarily indirect for individual spec-delta validation.

## Proposed solution

Make single-artifact `specd changes validate` surface the diff directly when all of the following are true:

- the target artifact is `scope: spec`
- the command is an individual validation, not `--all`
- the validated artifact is an existing delta-backed spec artifact rather than a new spec file

The command remains a structural/state validation gate. It does not become semantic approval, but it also shows the relevant diff immediately so the reviewer can inspect whether the delta breaks prior contracts or removes content that should remain.

Workflow guidance in `packages/skills` should be updated so that, in this specific validation path, agents review the diff shown by `validate` instead of requiring a separate `spec-preview` step. Outside that narrow path, `spec-preview` remains the authoritative merged-content review command.

The change must also define the review-surface boundaries explicitly:

- exactly when the diff is shown
- whether it is shown only on successful validation or also on certain failure paths
- what happens when structural validation fails before merged diff material can be trusted
- what happens when merged diff generation itself fails even though validation can still report structural results

One decision is already fixed from user guidance: the diff is shown only when validation succeeds and the delta merge has been computed correctly. Failed validation paths do not surface an inline diff that could be mistaken for a trustworthy review surface.

The remaining proposal-level decisions are also fixed:

- if delta validation fails or delta application fails before a trustworthy merged result exists, `changes validate` reports the structural failure only and does not show an inline diff
- if structural validation succeeds but diff generation fails, `changes validate` still succeeds, omits the inline diff, and reports a note/warning telling the reviewer to use `specd changes spec-preview <name> <specId> --diff --artifact <artifactId>` manually
- the inline review surface is always restricted to the exact validated artifact; it must not expand to unrelated spec-scoped artifacts from the same spec

## Specs affected

### New specs

- none

### Modified specs

- `cli:change-validate`: update single-validation output requirements so spec-scoped delta validation can surface an inline diff while preserving the command's structural-validation contract and leaving `--all` unchanged.
  - Depends on (added): `core:preview-spec`
  - Depends on (removed): none

- `cli:change-spec-preview`: clarify its role after validate gains inline diff review, keeping `spec-preview` as the dedicated merged/diff review surface outside the narrow single-validate path.
  - Depends on (added): none
  - Depends on (removed): none

- `core:diff-generator`: define the dedicated diff-generation failure contract so diff production can fail in a typed, controllable way without collapsing preview or validate flows.
  - Depends on (added): none
  - Depends on (removed): none

- `core:preview-spec`: confirm or extend the diff-preview contract so CLI validation can reuse spec-scoped merged diff output for one artifact without duplicating merge or diff logic.
  - This spec also needs to capture explicit handling of the dedicated diff-generation error as a warning-producing non-fatal case.
  - Depends on (added): none
  - Depends on (removed): none

- `core:validate-artifacts`: update the validation contract if needed so single-artifact validation can support inline diff review for existing spec deltas without changing batch semantics or weakening structural validation guarantees. This may remain a no-op at implementation time if the final design routes diff review entirely through CLI + `PreviewSpec`, but it stays in scope until that is confirmed.
  - Depends on (added): none
  - Depends on (removed): none

- `skills:workflow-automation`: update workflow guidance so agents review the inline diff produced by `changes validate` for individual spec-delta validation, while still using `spec-preview` when broader merged-content review is required.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- CLI UX for `packages/cli/src/commands/change/validate.ts`
- Preview/diff reuse boundaries between validation and preview flows
- Diff-generator error contract and non-fatal warning behavior
- Core validation and/or preview contracts in `@specd/core`
- Skill templates in `packages/skills/templates/shared/` and `packages/skills/templates/skills/`
- Tests covering single-artifact validation output, spec-delta review guidance, and non-regression for `--all`

No schema-level expansion to change-scoped delta artifacts is intended. `proposal`, `design`, and `tasks` remain direct change-scoped files.

## Technical context

- The original request was first phrased for `scope: change`, but after investigation this was corrected to `scope: spec`.
- That correction matters because current diff generation already exists in the spec-scoped preview flow via `PreviewSpec`, while change-scoped artifacts do not use the same delta-backed model.
- Current `cli:change-validate` already distinguishes structural validation from content review and already points spec-scoped users to `spec-preview`; this change tightens that flow rather than replacing it outright.
- `PreviewSpec` already owns merged-content reconstruction and optional unified diff generation for spec-scoped artifacts. Reusing that responsibility is preferable to duplicating merge/diff logic in the CLI.
- The current default `DiffGenerator` implementation does not appear to raise a known domain error in normal operation, but the `PreviewSpec` contract already treats diff generation as a non-fatal step.
- The user wants this fallback tightened by introducing an explicit typed error for diff-generation failures, so `PreviewSpec` can capture that failure mode intentionally and emit a clear warning instead of relying only on a generic catch path.
- The user explicitly wants no behavior change for `--all`.
- The user explicitly wants skill guidance in the `packages/skills` package updated so the reviewer checks the diff shown by `validate` to catch contract regressions or unintended removals.
- The user additionally wants the change to pin down edge cases that were previously unspecified:
  - the exact trigger conditions for showing the diff
  - what `validate` should do when the delta fails validation
  - what `validate` should do when diff generation is unavailable or fails
- The user explicitly decided that inline diff output is gated on successful validation plus successful delta merge materialization.
- The user explicitly wants diff-generation failure to be controllable through a dedicated `DiffGenerator` error type that `PreviewSpec` handles as a warning-producing non-fatal case.
- The user also wants proposal scope closed before moving on to downstream artifacts.

## Open questions

_none_
