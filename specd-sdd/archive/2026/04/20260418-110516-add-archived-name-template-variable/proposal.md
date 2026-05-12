# Proposal: add-archived-name-template-variable

## Motivation

Archived post-hook flows now rely on `{{change.archivedName}}` in real commands (notably post-archive changeset generation), but the variable is not defined in the spec contracts. This creates a spec/code drift that can break deterministic hook authoring and review.

## Current behaviour

`RunStepHooks` already injects `change.archivedName` for archived post-hook execution, and schema overrides use that token in `archiving.post` hooks. However, `core:core/run-step-hooks` and `core:core/template-variables` only document `change.name`, `change.workspace`, and `change.path`.

## Proposed solution

Update the hook/template variable specs so `change.archivedName` is an explicit supported variable for archived-change flows. Add verification scenarios that prove the variable is available when archived post hooks run, including the post-archive changeset path that consumes `{{change.archivedName}}`.

## Specs affected

### New specs

- none

### Modified specs

- `core:core/run-step-hooks`: extend hook-variable construction contract to include `change.archivedName` for archive fallback execution.
  - Depends on (added): none
- `core:core/template-variables`: extend the contextual `change` namespace contract to include `change.archivedName` for archived contexts.
  - Depends on (added): none

## Impact

- Affects spec contracts used by hook authoring and review for archive-time behavior.
- Clarifies guarantees for hooks that consume archive naming, especially `archiving-create-changeset`.
- No intended functional behavior change beyond making current runtime behavior normative.

## Technical context

- Runtime behavior already exists in `packages/core/src/application/use-cases/run-step-hooks.ts` where archived fallback variables include `archivedName`.
- Existing docs/specs currently omit this key, which is the drift to resolve.
- The archive hook command in config uses `node scripts/hooks/post-archive-changeset.js {{change.archivedName}}`, so this variable must be contractually supported.

## Open questions

- none
