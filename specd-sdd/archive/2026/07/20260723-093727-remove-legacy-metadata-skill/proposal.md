# Proposal: remove-legacy-metadata-skill

## Motivation

`specd-metadata` / `specd-spec-metadata` duplicated metadata-optimization work now owned by specialized agents. Completing the removal closes the last active invocation paths before external users depend on the obsolete skill.

## Current behaviour

Canonical removal has largely already landed in the tree: the `specd-metadata` template directory is gone, plugin `skillFrontmatter` maps no longer register it, archive guidance already points to `specd-spec-context-optimizer`, and the live `skills:skill-templates-source` / `skills:agents` requirements already forbid publishing the standard skill.

What remains broken is project-local commit guidance (`.claude` / `.agents` / `.codex` `commit` skills): it still tells agents to invoke `specd-spec-metadata` and to stage obsolete `.specd-metadata.yaml` sidecars. That keeps an active obsolete interface and conflicts with lock-owned optimizations persisted through `specs optimizations set`.

## Proposed solution

Treat the template-source and agents contracts as already correct (`no-op` deltas). Finish the removal by rewriting commit-skill guidance so it no longer invokes the legacy skill, aligns metadata refresh with the current self-healing / `generate-metadata` and `specs optimizations` model, and verify that no active source or rendered skill still names `specd-metadata` or `specd-spec-metadata`.

## Specs affected

### New specs

None.

### Modified specs

- `skills:skill-templates-source`: requirements already exclude `specd-metadata` from the standard-template inventory; this change records a `no-op` delta and implements remaining cleanup against that contract.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:agents`: requirements already establish specialized optimizer agents as the exclusive metadata-optimization interface; this change records a `no-op` delta and removes leftover invocation paths.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Primary remaining impact is project-local commit skills under `.claude/skills/commit`, `.agents/skills/commit`, and `.codex/skills/commit`. Canonical template discovery, plugin frontmatter maps, archive templates, and core/CLI metadata infrastructure stay as they are. No public API or persistence model changes in this change.

## Technical context

- Direct removal remains approved: no alias, deprecation window, or migration docs.
- Persist path for optimized fields is `specs optimizations set` / `clear` (lock-owned), not the removed `update-metadata` / `UpdateSpecMetadata` surface.
- Optimizer agents already use that path; archive templates already recommend `specd-spec-context-optimizer`.
- Historical archives and incidental `.specd-metadata.yaml` wording in unrelated specs stay out of scope unless they form an active skill invocation path.
- Spec deltas previously written for this change now merge as empty diffs against base; converting them to `no-op` avoids pretending the contracts still need editing.

## Open questions

None.
