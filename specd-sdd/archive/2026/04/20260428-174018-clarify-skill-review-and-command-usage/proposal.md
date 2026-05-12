# Proposal: clarify-skill-review-and-command-usage

## Motivation

The skills guidance has drifted behind recent CLI improvements, causing avoidable multi-step command sequences and ambiguous review behavior. This should be corrected now to reduce operator friction and prevent unsafe spec edits caused by stale overlap deltas.

## Current behaviour

Current workflow guidance still references older command shapes in some places and does not consistently promote canonical plural command forms and newer flags that collapse repeated calls. It also leaves room to misread `changes validate` as content-quality approval, while in practice it validates structural/state constraints. As a result, a change can pass validation without an explicit semantic review of artifact content, and overlap drift can leave outdated deltas that risk overwriting important material unless manually previewed.
Some skills also keep defensive read steps that may now be redundant (for example running `schema show`, `project context`/`project status`, or similar commands even when the required data has already been returned by earlier workflow commands in the same step).

## Proposed solution

Update workflow automation requirements and related CLI guidance contracts (without changing CLI command runtime behavior) so skills explicitly:

- Prefer current canonical commands and modern parameters when they replace multi-call flows.
- Remove or consolidate redundant read commands when earlier mandatory commands already provide equivalent data needed by the skill step.
- Define `changes validate` as structural validation only.
- Require explicit content review before considering artifacts ready.
- Require `changes spec-preview` checks when overlap/drift risk exists to verify merged output before proceeding.
- Introduce context-freshness rules per skill step: a command may be skipped only when required information is already available and still trustworthy for that exact execution moment; otherwise it must run again.

## Specs affected

### New specs

- none

### Modified specs

- `skills:workflow-automation`: tighten workflow instructions so skill templates consistently use current canonical command forms and fewer calls when new parameters/flags provide equivalent outcomes, and add explicit review semantics and drift safeguards.
  - Depends on (added): none
- `cli:change-validate`: clarify requirement language and usage guidance so validation is explicitly structural/state-oriented and not a substitute for semantic content review.
  - Depends on (added): none
- `cli:change-spec-preview`: strengthen usage guidance around preview for overlap/drift safety and merged-content verification before accepting deltas.
  - Depends on (added): none
- `cli:command-resource-naming`: align skill/command guidance with canonical plural resource naming to avoid stale singular usage patterns.
  - Depends on (added): none

## Impact

- Affected code areas:
  - `packages/skills/templates/shared/shared.md`
  - `packages/skills/templates/specd*/SKILL.md`
  - CLI usage/spec alignment around validate, preview, and canonical naming
- No new external dependencies are expected.
- Primary impact is on workflow correctness, command ergonomics, and change-safety guardrails.
- No functional runtime changes to CLI command execution are intended in this change.
- Skill execution remains robust when steps are run non-sequentially (different sessions, delayed execution, or missing prior context).

## Technical context

Recent commits established the baseline to align with:

- `d32a861b` standardized plural canonical command naming.
- `c88761e3` added artifact filtering to `changes spec-preview`.
- `2852b447` added `--artifact` to `specs show`.
- `5f6a8230` aligned validate blocker diagnostics with transition states.
- `f4aa390a` improved diagnostics and artifact DAG UX.

The conversation confirmed a workflow-level requirement: `changes validate` must be treated as structural gating only, while human/agent review must verify semantic correctness of artifact content. The conversation also confirmed a safety requirement: overlap drift can stale deltas, so merged previews must be checked before trusting delta outcomes.
The conversation also added an efficiency requirement: review each skill step for commands that became unnecessary after CLI output improvements (for example cases where `schema show` or project-level reads are duplicated without adding new required context).
The conversation added specific candidates to analyze by execution order and cross-skill timing:

- Whether `spec-preview` is still needed in `specd-verify` when deltas are already being read in that flow.
- Whether impact analysis is required before implementation if it was already produced in design (and how to decide freshness in verify/archive).
- Whether data commonly fetched via `schema show` is already available from a preceding `changes status` call for the same step, allowing conditional skip when coverage is equivalent and still fresh.
- Avoid assumptions that all skills run back-to-back; each skill may execute later with no reliable in-memory context from previous runs.

## Open questions

Resolved in conversation:

- Guidance style: normative rules only (no mandatory before/after examples).
- Redundancy handling: include a deterministic equivalence map for safe command elimination (for example when `changes status` already provides data otherwise read via `schema show`).
- Freshness strategy: reuse `change context` fingerprint as the baseline reusable freshness signal; avoid assuming continuity without a freshness check.
- Coverage: apply review-semantics clarification in specs/skills and mirror it in CLI docs in this same change.
